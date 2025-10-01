const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const XLSX = require("xlsx");
const session = require("express-session");
const compression = require("compression");
const db = require("./db/client");

const app = express();
const upload = multer({ dest: "uploads/" });
const isProduction = process.env.NODE_ENV === "production";

const CLAVE_CORRECTA = "Victoria2025**";

app.use(session({
    secret: "clave-super-secreta",
    resave: false,
    saveUninitialized: false
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(compression({ threshold: 0 }));

const prerenderedAssetsDir = path.join(__dirname, "assets", "prerendered");

const assetCacheOptions = {
    maxAge: isProduction ? "14d" : 0,
    setHeaders: (res, assetPath) => {
        if (!isProduction) {
            res.setHeader("Cache-Control", "no-cache");
            return;
        }
        if (/\.(svg|png|jpg|jpeg|gif|webp)$/i.test(assetPath)) {
            res.setHeader("Cache-Control", "public, max-age=1209600, immutable");
        }
    }
};

// app.use("/admin", checkAdmin, express.static("public"));

function checkAdmin(req, res, next) {
    if (req.session && req.session.adminAutenticado) return next();
    // Permite el acceso a la página de login sin estar autenticado
    if (req.path === "/admin-login" || req.path === "/admin-login/") return next();
    res.redirect("/admin-login");
}

async function ensureSchema() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS invitados (
                                                     id VARCHAR(255) PRIMARY KEY,
                nombre VARCHAR(255),
                apellido VARCHAR(255),
                cantidad INT,
                confirmados INT,
                estado VARCHAR(255)
                )
        `);
    } catch (error) {
        console.error("Error al preparar la base de datos:", error);
        throw error;
    }
}

ensureSchema().catch((error) => {
    console.error("La aplicación no pudo inicializar la base de datos.", error);
});

function normalizarTexto(texto) {
    return texto.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9\-]/g, "")
        .toLowerCase();
}

async function existeId(id, executor = db) {
    const row = await executor.one("SELECT 1 FROM invitados WHERE id = ?", [id]);
    return Boolean(row);
}

// RUTA PRINCIPAL MODIFICADA
app.get("/", (req, res) => {
    res.render("home");
});

app.get("/estado", async (req, res) => {
    try {
        const row = await db.one("SELECT COUNT(*) AS total FROM invitados");
        const isAdmin = req.session && req.session.adminAutenticado;
        res.json({ ok: true, total: row ? row.total : 0, admin: isAdmin });
    } catch (error) {
        console.error("Error al obtener el estado:", error);
        res.json({ ok: false });
    }
});

app.get("/admin", checkAdmin, (req, res) => {
    res.redirect("/admin/invitados");
});

app.get("/admin/backup", checkAdmin, async (req, res) => {
    try {
        const rows = await db.query("SELECT * FROM invitados ORDER BY nombre");

        await fsp.mkdir(path.join(__dirname, "backups"), { recursive: true });

        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
        const backupFileName = `backup-${timestamp}.json`;
        const backupPath = path.join(__dirname, "backups", backupFileName);

        await fsp.writeFile(backupPath, JSON.stringify(rows, null, 2), "utf8");

        res.download(backupPath, backupFileName, (err) => {
            if (err && !res.headersSent) {
                res.status(500).json({ ok: false, error: "No se pudo descargar el respaldo." });
            }
        });
    } catch (error) {
        console.error("Error al generar el respaldo:", error);
        res.status(500).json({ ok: false, error: "No se pudo generar el respaldo." });
    }
});

app.get("/admin-login", (req, res) => {
    res.send(`
        <html><body style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h2>Área protegida</h2>
            <form method="POST" action="/admin-login">
                <input type="password" name="clave" placeholder="Ingresá la clave" style="padding:10px; font-size:16px;" required />
                <br><br>
                <button type="submit" style="padding:10px 20px; font-size:16px;">Ingresar</button>
            </form>
        </body></html>
    `);
});

app.post("/admin-login", (req, res) => {
    if (req.body.clave === CLAVE_CORRECTA) {
        req.session.adminAutenticado = true;
        res.redirect("/admin");
    } else {
        res.send("<p style='color:red; font-family:sans-serif;'>Clave incorrecta. <a href='/admin-login'>Volver</a></p>");
    }
});

app.get("/admin-logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

function runAsync(sql, params = [], executor = db) {
    return executor.query(sql, params);
}

app.post("/upload", upload.single("excel"), async (req, res) => {
    const filePath = req.file && req.file.path;
    if (!filePath) {
        return res.redirect("/admin/invitados?import=missing");
    }

    try {
        const workbook = XLSX.readFile(filePath);
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
        const datos = XLSX.utils.sheet_to_json(hoja);

        const posiblesClavesCantidad = [
            "Cantidad",
            "cantidad",
            "Cantidad Invitados",
            "Cantidad invitados",
            "Cantidad de Invitados",
            "Cantidad de invitados",
            "Invitados",
            "Personas"
        ];

        await db.transaction(async (trx) => {
            for (const fila of datos) {
                const idBase = normalizarTexto((fila.Nombre || "") + "-" + (fila.Apellido || ""));
                let id = idBase;
                let contador = 1;
                while (await existeId(id, trx)) {
                    id = idBase + "-" + contador++;
                }

                let cantidadRaw = undefined;
                for (const clave of posiblesClavesCantidad) {
                    if (Object.prototype.hasOwnProperty.call(fila, clave) && fila[clave] !== undefined && fila[clave] !== null && fila[clave] !== "") {
                        cantidadRaw = fila[clave];
                        break;
                    }
                }

                let cantidadNormalizada = parseInt(cantidadRaw, 10);
                if (Number.isNaN(cantidadNormalizada) || cantidadNormalizada < 0) {
                    cantidadNormalizada = 0;
                    console.warn("Fila sin cantidad válida, se usará 0:", fila);
                }

                await runAsync(
                    "INSERT INTO invitados (id, nombre, apellido, cantidad, estado, confirmados) VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        id,
                        fila.Nombre || null,
                        fila.Apellido || null,
                        cantidadNormalizada,
                        "pendiente",
                        0
                    ],
                    trx
                );
            }
        });

        await fsp.unlink(filePath).catch(() => {});
        res.redirect("/admin/invitados?import=success");
    } catch (error) {
        console.error("Error al procesar la importación:", error);
        await fsp.unlink(filePath).catch(() => {});

        return res.redirect("/admin/invitados?import=error");
    }
});

// RUTA DE CONFIRMACIÓN MODIFICADA (Esta es la sección a reemplazar)
app.get("/confirmar/:id", async (req, res) => {
    const id = req.params.id;
    const mostrarToast = req.query.exito === "1";

    try {
        const invitado = await db.one("SELECT * FROM invitados WHERE id = ?", [id]);

        if (!invitado) {
            return res.status(404).render("mensaje", {
                titulo: "Error",
                tituloH1: "Invitación no encontrada",
                mensaje: "El enlace que utilizaste no parece ser válido. Por favor, verifica el link o contacta a los organizadores."
            });
        }

        const bloquearFormulario = invitado.estado !== "pendiente";
        let alerta = null;

        if (req.query.exito === "1") {
            let mensajeExito;
            if (invitado.estado === "confirmado") {
                const cantidadConfirmada = invitado.confirmados || 0;
                mensajeExito = `¡Gracias! Confirmamos tu asistencia para ${cantidadConfirmada} persona(s).`;
            } else if (invitado.estado === "rechazado") {
                mensajeExito = "Registramos que no podrán acompañarnos. ¡Gracias por avisarnos!";
            } else {
                mensajeExito = "¡Gracias! Registramos tu respuesta.";
            }

            alerta = { tipo: "exito", mensaje: mensajeExito };
        }

        const mostrarResumen = bloquearFormulario && !alerta;

        res.render("invitacion", {
            invitado,
            bloquearFormulario,
            alerta,
            mostrarResumen,
            mostrarToast
        });
    } catch (error) {
        console.error("Error al obtener invitado:", error);
        res.status(500).render("mensaje", {
            titulo: "Error",
            tituloH1: "No se pudo cargar la invitación",
            mensaje: "Ocurrió un problema al cargar la invitación. Intentá nuevamente más tarde."
        });
    }
});


// RUTA POST (ya está correcta, la incluyo para dar contexto)
app.post("/confirmar/:id", async (req, res) => {
    const id = req.params.id;
    const { decision } = req.body;
    let { confirmados } = req.body;

    if (!["confirmado", "rechazado"].includes(decision)) {
        return res.status(400).send("Decisión inválida.");
    }

    try {
        const invitado = await db.one("SELECT * FROM invitados WHERE id = ?", [id]);

        if (!invitado) {
            return res.status(404).send("Invitación no encontrada.");
        }

        if (invitado.estado !== "pendiente") {
            let mensajeInfo;
            if (invitado.estado === "confirmado") {
                const cantidadConfirmada = invitado.confirmados || 0;
                mensajeInfo = `Ya registramos que asistirán ${cantidadConfirmada} persona(s). Si necesitás actualizar algún dato, contactá a los organizadores.`;
            } else if (invitado.estado === "rechazado") {
                mensajeInfo = "Ya registramos que no podrán acompañarnos. Si necesitás actualizar algún dato, contactá a los organizadores.";
            } else {
                mensajeInfo = "Ya registramos tu respuesta para esta invitación. Si necesitás actualizar algún dato, contactá a los organizadores.";
            }

            return res.status(409).render("invitacion", {
                invitado,
                bloquearFormulario: true,
                alerta: {
                    tipo: "info",
                    mensaje: mensajeInfo
                },
                mostrarResumen: false,
                mostrarToast: false
            });
        }

        const max = parseInt(invitado.cantidad || 0, 10);
        let confirmadosInt = 0;

        if (decision === "confirmado") {
            confirmadosInt = parseInt(confirmados, 10);

            if (isNaN(confirmadosInt) || confirmadosInt < 1) confirmadosInt = 1;
            if (confirmadosInt > max) confirmadosInt = max;
        }

        const result = await db.query(
            "UPDATE invitados SET estado = ?, confirmados = ? WHERE id = ? AND estado = 'pendiente'",
            [decision, confirmadosInt, id]
        );

        if (!result || result.affectedRows === 0) {
            return res.redirect(`/confirmar/${id}`);
        }

        return res.redirect(`/confirmar/${id}?exito=1`);
    } catch (error) {
        console.error("Error al actualizar confirmación:", error);
        return res.status(500).send("Error al guardar respuesta.");
    }
});

// RUTA DE "GRACIAS"
app.get("/gracias", (req, res) => {
    res.render("mensaje", {
        titulo: "Confirmación Enviada",
        tituloH1: "¡Respuesta Enviada!",
        mensaje: "Muchas gracias por tu confirmación. ¡Te esperamos para celebrar!"
    });
});

// --- PANEL DE ADMINISTRACIÓN MEJORADO ---

// RUTA DEL LISTADO DE INVITADOS MODIFICADA
app.get("/admin/invitados", checkAdmin, async (req, res) => {
    try {
        const q = req.query.q;
        const termino = q?.trim();

        let invitados;
        if (termino) {
            const likeTerm = `%${termino}%`;
            invitados = await db.many(
                "SELECT * FROM invitados WHERE nombre LIKE ? OR apellido LIKE ? ORDER BY nombre",
                [likeTerm, likeTerm]
            );
        } else {
            invitados = await db.many("SELECT * FROM invitados ORDER BY nombre");
        }

        let totalInvitados = 0;
        let confirmados = 0;
        invitados.forEach(r => {
            totalInvitados += Number(r.cantidad) || 0;
            confirmados += Number(r.confirmados) || 0;
        });
        const pendientes = invitados.filter(r => r.estado === "pendiente").length;
        const rechazados = invitados.filter(r => r.estado === "rechazado").length;
        const baseUrl = req.protocol + "://" + req.get("host");

        const mensajeExito = req.query.exito === "1" ? "Invitado eliminado correctamente." : null;
        const mensajeReset = req.query.reset === "1" ? "Se eliminaron todos los registros correctamente." : null;
        let mensajeImportacion = null;

        switch (req.query.import) {
            case "success":
                mensajeImportacion = { tipo: "exito", texto: "Importación realizada correctamente." };
                break;
            case "error":
                mensajeImportacion = {
                    tipo: "error",
                    texto: "No se pudo procesar el archivo. Verificá el contenido e intentá nuevamente."
                };
                break;
            case "missing":
                mensajeImportacion = { tipo: "error", texto: "No se seleccionó ningún archivo para importar." };
                break;
            default:
                mensajeImportacion = null;
        }

        res.render("admin_invitados", {
            invitados,
            totalInvitados,
            confirmados,
            pendientes,
            rechazados,
            baseUrl,
            mensajeExito,
            mensajeReset,
            mensajeImportacion,
            termino
        });
    } catch (error) {
        console.error("Error al obtener invitados:", error);
        res.status(500).send("Error al leer invitados");
    }
});

app.get("/admin/invitado/nuevo", checkAdmin, (req, res) => {
    res.render("admin_nuevo_invitado");
});

app.post("/admin/invitado/crear", checkAdmin, async (req, res) => {
    const { nombre = "", apellido = "", cantidad = 0 } = req.body;

    try {
        const nombreLimpio = nombre.trim();
        const apellidoLimpio = apellido.trim();
        const cantidadNumero = Math.max(parseInt(cantidad, 10) || 0, 0);

        const textoBase = [nombreLimpio, apellidoLimpio].filter(Boolean).join("-");
        let idBase = normalizarTexto(textoBase);
        if (!idBase) {
            idBase = "invitado";
        }

        let id = idBase;
        let contador = 1;
        while (await existeId(id)) {
            id = `${idBase}-${contador++}`;
        }

        await runAsync(
            "INSERT INTO invitados (id, nombre, apellido, cantidad, estado, confirmados) VALUES (?, ?, ?, ?, ?, ?)",
            [
                id,
                nombreLimpio || null,
                apellidoLimpio || null,
                cantidadNumero,
                "pendiente",
                0
            ]
        );

        res.redirect("/admin/invitados");
    } catch (error) {
        console.error("Error al crear el invitado:", error);
        res.status(500).render("mensaje", {
            titulo: "Error al crear invitado",
            tituloH1: "No se pudo guardar el invitado",
            mensaje: "Ocurrió un problema al guardar el nuevo invitado. Intentá nuevamente."
        });
    }
});

// NUEVA RUTA: Mostrar el formulario de edición
app.get("/admin/invitado/editar/:id", checkAdmin, async (req, res) => {
    const id = req.params.id;

    try {
        const invitado = await db.one("SELECT * FROM invitados WHERE id = ?", [id]);
        if (!invitado) return res.status(404).send("Invitado no encontrado.");
        res.render("admin_editar_invitado", { invitado });
    } catch (error) {
        console.error("Error al buscar invitado:", error);
        res.status(500).send("Error al obtener invitado.");
    }
});

// NUEVA RUTA: Procesar la actualización del invitado
app.post("/admin/invitado/actualizar/:id", checkAdmin, async (req, res) => {
    const id = req.params.id;
    const { nombre, apellido, cantidad, confirmados, estado } = req.body;

    const cantidadNumero = parseInt(cantidad, 10);
    const confirmadosNumero = parseInt(confirmados, 10);

    const cantidadNormalizada = Number.isNaN(cantidadNumero) ? 0 : cantidadNumero;
    let confirmadosNormalizados = Number.isNaN(confirmadosNumero) ? 0 : confirmadosNumero;

    if (estado !== "confirmado") {
        confirmadosNormalizados = 0;
    } else if (confirmadosNormalizados > cantidadNormalizada) {
        confirmadosNormalizados = cantidadNormalizada;
    }

    try {
        await db.query(
            "UPDATE invitados SET nombre = ?, apellido = ?, cantidad = ?, confirmados = ?, estado = ? WHERE id = ?",
            [
                nombre || null,
                apellido || null,
                cantidadNormalizada,
                confirmadosNormalizados,
                estado,
                id
            ]
        );
        res.redirect("/admin/invitados");
    } catch (error) {
        console.error("Error al actualizar invitado:", error);
        res.status(500).send("Error al actualizar el invitado.");
    }
});


app.post("/admin/invitado/eliminar/:id", checkAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const resultado = await db.query("DELETE FROM invitados WHERE id = ?", [id]);

        if (resultado && resultado.affectedRows === 0) {
            return res.status(404).render("mensaje", {
                titulo: "Invitado no encontrado",
                tituloH1: "No se encontró el invitado",
                mensaje: "El invitado que intentás eliminar no existe."
            });
        }

        res.redirect("/admin/invitados?exito=1");
    } catch (error) {
        console.error("Error al eliminar invitado:", error);
        res.status(500).render("mensaje", {
            titulo: "Error al eliminar invitado",
            tituloH1: "No se pudo eliminar el invitado",
            mensaje: "Ocurrió un problema al eliminar el invitado. Intentá nuevamente."
        });
    }
});


app.post("/admin/borrar-todo", checkAdmin, async (req, res) => {
    try {
        await db.query("DELETE FROM invitados");
        res.redirect("/admin/invitados?reset=1");
    } catch (error) {
        console.error("Error al borrar invitados:", error);
        res.status(500).send("Error al borrar.");
    }
});

// RUTA PARA DESCARGAR LINKS (MODIFICADA PARA GENERAR EXCEL)
app.get("/admin/descargar-links", checkAdmin, async (req, res) => {
    try {
        const rows = await db.many("SELECT id, nombre, apellido FROM invitados ORDER BY nombre");

        // 1. Preparamos los datos para el Excel
        const datosParaExcel = rows.map(invitado => {
            return {
                Nombre: invitado.nombre,
                Apellido: invitado.apellido || "", // Aseguramos que no sea null
                Link: `https://quincevictoria.onrender.com/confirmar/${invitado.id}`
            };
        });

        // 2. Creamos una nueva hoja de cálculo a partir de los datos
        const hojaDeCalculo = XLSX.utils.json_to_sheet(datosParaExcel);

        // Opcional: Ajustar el ancho de las columnas
        hojaDeCalculo["!cols"] = [
            { wch: 25 }, // Ancho columna Nombre
            { wch: 25 }, // Ancho columna Apellido
            { wch: 60 }  // Ancho columna Link
        ];

        // 3. Creamos un nuevo libro de trabajo y añadimos la hoja
        const libroDeTrabajo = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libroDeTrabajo, hojaDeCalculo, "Links de Invitados");

        // 4. Escribimos el libro en un buffer para enviarlo como respuesta
        const buffer = XLSX.write(libroDeTrabajo, { type: "buffer", bookType: "xlsx" });

        // 5. Configuramos las cabeceras y enviamos el archivo
        res.setHeader("Content-Disposition", "attachment; filename=links_invitados.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);
    } catch (error) {
        console.error("Error al generar links:", error);
        res.status(500).send("Error al generar los links.");
    }
});

app.get("/admin/descargar-confirmaciones", checkAdmin, async (req, res) => {
    const header = "Nombre,Apellido,Estado,Confirmados\n";
    try {
        const rows = await db.many("SELECT nombre, apellido, estado, confirmados FROM invitados");
        const contenido = rows.map(r => `${r.nombre},${r.apellido || ''},${r.estado},${r.confirmados}`).join("\n");
        res.setHeader("Content-disposition", "attachment; filename=confirmaciones.csv");
        res.setHeader("Content-Type", "text/csv");
        res.send(header + contenido);
    } catch (error) {
        console.error("Error al generar confirmaciones:", error);
        res.status(500).send("Error al generar archivo.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));

// Middleware para manejo global de errores
app.use((err, req, res, next) => {
    console.error('Error no controlado:', err);
    if (res.headersSent) return next(err);
    res.status(500).render("mensaje", {
        titulo: "Error interno",
        tituloH1: "Ocurrió un error inesperado",
        mensaje: "Algo salió mal. Por favor, intentá nuevamente más tarde."
    });
});

// Optimización extra de assets: cache y compresión
if (isProduction) {
    app.use("/assets", express.static(path.join(__dirname, "assets"), {
        maxAge: "30d",
        setHeaders: (res, path) => {
            if (path.endsWith('.svg') || path.endsWith('.webp') || path.endsWith('.avif') || path.endsWith('.png')) {
                res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
            }
        }
    }));
}

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use('/assets', require('express').static(__dirname + '/assets'));
