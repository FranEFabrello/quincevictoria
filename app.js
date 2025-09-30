const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const XLSX = require("xlsx");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const compression = require("compression");

const app = express();
const upload = multer({ dest: "uploads/" });
const db = new sqlite3.Database("database.db", (err) => {
    if (err) {
        console.error("Error al abrir la base de datos:", err);
    }
});

db.exec("PRAGMA journal_mode=WAL;", (err) => {
    if (err) {
        console.error("No se pudo habilitar el modo WAL:", err);
    }
});

try {
    db.configure("busyTimeout", 5000);
} catch (error) {
    console.error("No se pudo configurar el busyTimeout de la base de datos:", error);
}
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

app.use("/assets", express.static(prerenderedAssetsDir, assetCacheOptions));

app.use("/assets", (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    if (ext !== ".svg") return next();

    const baseName = path.basename(req.path, ".svg");
    const avifPath = path.join(prerenderedAssetsDir, `${baseName}.avif`);
    const webpPath = path.join(prerenderedAssetsDir, `${baseName}.webp`);
    const pngPath = path.join(prerenderedAssetsDir, `${baseName}.png`);

    const accept = req.headers['accept'] || '';

    if (accept.includes('image/avif') && fs.existsSync(avifPath)) {
        return res.type('image/avif').sendFile(avifPath);
    }
    if (accept.includes('image/webp') && fs.existsSync(webpPath)) {
        return res.type('image/webp').sendFile(webpPath);
    }
    if (accept.includes('image/png') && fs.existsSync(pngPath)) {
        return res.type('image/png').sendFile(pngPath);
    }
    return next();
});

app.use("/assets", express.static(path.join(__dirname, "assets"), assetCacheOptions));



app.use("/admin", checkAdmin, express.static("public"));

function checkAdmin(req, res, next) {
    if (req.session && req.session.adminAutenticado) return next();
    // Permite el acceso a la página de login sin estar autenticado
    if (req.path === "/admin-login" || req.path === "/admin-login/") return next();
    res.redirect("/admin-login");
}

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS invitados (
                                                     id TEXT PRIMARY KEY,
                                                     nombre TEXT,
                                                     apellido TEXT,
                                                     cantidad INTEGER,
                                                     confirmados INTEGER,
                                                     estado TEXT
            )`);
});

function normalizarTexto(texto) {
    return texto.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9\-]/g, "")
        .toLowerCase();
}

function existeId(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT 1 FROM invitados WHERE id = ?", [id], (err, row) => {
            if (err) return reject(err);
            resolve(!!row);
        });
    });
}

// RUTA PRINCIPAL MODIFICADA
app.get("/", (req, res) => {
    res.render("home");
});

app.get("/estado", (req, res) => {
    db.get("SELECT COUNT(*) as total FROM invitados", (err, row) => {
        if (err) return res.json({ ok: false });
        const isAdmin = req.session && req.session.adminAutenticado;
        res.json({ ok: true, total: row.total, admin: isAdmin });
    });
});

app.get("/admin", checkAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin/backup", checkAdmin, async (req, res) => {
    try {
        await fsp.mkdir(path.join(__dirname, "backups"), { recursive: true });

        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
        const backupFileName = `backup-${timestamp}.db`;
        const sourcePath = path.join(__dirname, "database.db");
        const backupPath = path.join(__dirname, "backups", backupFileName);

        await fsp.copyFile(sourcePath, backupPath);

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

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                return reject(err);
            }
            resolve(this);
        });
    });
}

function execAsync(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

app.post("/upload", upload.single("excel"), async (req, res) => {
    const filePath = req.file && req.file.path;
    if (!filePath) {
        return res.status(400).render("mensaje", {
            titulo: "Error al cargar archivo",
            tituloH1: "Archivo no encontrado",
            mensaje: "No se recibió ningún archivo para procesar. Intentá nuevamente."
        });
    }

    let transactionActiva = false;

    try {
        const workbook = XLSX.readFile(filePath);
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
        const datos = XLSX.utils.sheet_to_json(hoja);

        await execAsync("BEGIN TRANSACTION;");
        transactionActiva = true;

        const clavesCantidad = ["Cantidad", "cantidad", "Invitados", "invitados", "Personas", "personas", "Total", "total"];

        for (const fila of datos) {
            const idBase = normalizarTexto((fila.Nombre || "") + "-" + (fila.Apellido || ""));
            let id = idBase;
            let contador = 1;
            while (await existeId(id)) {
                id = idBase + "-" + contador++;
            }

            let cantidadCruda;
            for (const clave of clavesCantidad) {
                if (Object.prototype.hasOwnProperty.call(fila, clave)) {
                    cantidadCruda = fila[clave];
                    break;
                }
            }

            if (cantidadCruda === undefined) {
                console.warn("Fila sin columna de cantidad detectada:", fila);
            }

            let cantidadNormalizada = parseInt(cantidadCruda, 10);
            if (Number.isNaN(cantidadNormalizada)) {
                cantidadNormalizada = 0;
            }

            await runAsync(
                "INSERT INTO invitados (id, nombre, apellido, cantidad, estado, confirmados) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    id,
                    fila.Nombre,
                    fila.Apellido,
                    cantidadNormalizada,
                    "pendiente",
                    0
                ]
            );
        }

        await execAsync("COMMIT;");
        transactionActiva = false;

        await fsp.unlink(filePath).catch(() => {});
        res.redirect("/admin");
    } catch (error) {
        console.error("Error al procesar la importación:", error);

        if (transactionActiva) {
            try {
                await execAsync("ROLLBACK;");
            } catch (rollbackError) {
                console.error("Error al hacer ROLLBACK:", rollbackError);
            }
        }

        await fsp.unlink(filePath).catch(() => {});

        return res.status(500).render("mensaje", {
            titulo: "Error al importar invitados",
            tituloH1: "No se pudo procesar el archivo",
            mensaje: "Ocurrió un problema al cargar el archivo. Verificá que no existan invitados duplicados y volvé a intentarlo."
        });
    }
});

// RUTA DE CONFIRMACIÓN MODIFICADA (Esta es la sección a reemplazar)
app.get("/confirmar/:id", (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM invitados WHERE id = ?", [id], (err, row) => {
        if (err || !row) {
            return res.status(404).render("mensaje", {
                titulo: "Error",
                tituloH1: "Invitación no encontrada",
                mensaje: "El enlace que utilizaste no parece ser válido. Por favor, verifica el link o contacta a los organizadores."
            });
        }

        const bloquearFormulario = row.estado !== "pendiente";
        let alerta = null;

        if (req.query.exito === "1") {
            let mensajeExito;
            if (row.estado === "confirmado") {
                const cantidadConfirmada = row.confirmados || 0;
                mensajeExito = `¡Gracias! Registramos que asistirán ${cantidadConfirmada} persona(s).`;
            } else if (row.estado === "rechazado") {
                mensajeExito = "Registramos que no podrán acompañarnos. ¡Gracias por avisarnos!";
            } else {
                mensajeExito = "¡Gracias! Registramos tu respuesta.";
            }

            alerta = { tipo: "exito", mensaje: mensajeExito };
        }

        res.render("invitacion", {
            invitado: row,
            bloquearFormulario,
            alerta
        });
    });
});


// RUTA POST (ya está correcta, la incluyo para dar contexto)
app.post("/confirmar/:id", (req, res) => {
    const id = req.params.id;
    const { decision } = req.body;
    let { confirmados } = req.body;

    if (!["confirmado", "rechazado"].includes(decision)) {
        return res.status(400).send("Decisión inválida.");
    }

    db.get("SELECT * FROM invitados WHERE id = ?", [id], (err, invitado) => {
        if (err || !invitado) {
            return res.status(404).send("Invitación no encontrada.");
        }

        if (invitado.estado !== "pendiente") {
            return res.status(409).render("invitacion", {
                invitado,
                bloquearFormulario: true,
                alerta: {
                    tipo: "info",
                    mensaje: "Ya registramos tu respuesta. Si necesitás hacer un cambio, contactá a los organizadores."
                }
            });
        }

        const max = parseInt(invitado.cantidad || 0, 10);
        let confirmadosInt = 0;

        if (decision === "confirmado") {
            confirmadosInt = parseInt(confirmados, 10);

            if (isNaN(confirmadosInt) || confirmadosInt < 1) confirmadosInt = 1;
            if (confirmadosInt > max) confirmadosInt = max;
        }

        db.run(
            "UPDATE invitados SET estado = ?, confirmados = ? WHERE id = ? AND estado = 'pendiente'",
            [decision, confirmadosInt, id],
            function (err2) {
                if (err2) {
                    return res.status(500).send("Error al guardar respuesta.");
                }

                if (this.changes === 0) {
                    return res.redirect(`/confirmar/${id}`);
                }

                return res.redirect(`/confirmar/${id}?exito=1`);
            }
        );
    });
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
app.get("/admin/invitados", checkAdmin, (req, res) => {
    db.all("SELECT * FROM invitados ORDER BY nombre", [], (err, rows) => {
        if (err) return res.status(500).send("Error al leer invitados");

        let totalInvitados = 0;
        let confirmados = 0;
        rows.forEach(r => {
            totalInvitados += r.cantidad;
            confirmados += r.confirmados;
        });
        const pendientes = rows.filter(r => r.estado === 'pendiente').length;
        const rechazados = rows.filter(r => r.estado === 'rechazado').length;
        const baseUrl = req.protocol + "://" + req.get("host");

        res.render("admin_invitados", {
            invitados: rows,
            totalInvitados,
            confirmados,
            pendientes,
            rechazados,
            baseUrl
        });
    });
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
                nombreLimpio,
                apellidoLimpio,
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
app.get("/admin/invitado/editar/:id", checkAdmin, (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM invitados WHERE id = ?", [id], (err, row) => {
        if (err || !row) return res.status(404).send("Invitado no encontrado.");
        res.render("admin_editar_invitado", { invitado: row });
    });
});

// NUEVA RUTA: Procesar la actualización del invitado
app.post("/admin/invitado/actualizar/:id", checkAdmin, (req, res) => {
    const id = req.params.id;
    const { nombre, apellido, cantidad, confirmados, estado } = req.body;
    db.run(
        `UPDATE invitados SET nombre = ?, apellido = ?, cantidad = ?, confirmados = ?, estado = ? WHERE id = ?`,
        [nombre, apellido, cantidad, confirmados, estado, id],
        (err) => {
            if (err) return res.status(500).send("Error al actualizar el invitado.");
            res.redirect("/admin/invitados");
        }
    );
});


app.get("/admin/borrar-todo", checkAdmin, (req, res) => {
    db.run("DELETE FROM invitados", [], err => {
        if (err) return res.status(500).send("Error al borrar.");
        res.send("✅ Todos los datos fueron eliminados.");
    });
});

// RUTA PARA DESCARGAR LINKS (MODIFICADA PARA GENERAR EXCEL)
app.get("/admin/descargar-links", checkAdmin, (req, res) => {
    db.all("SELECT id, nombre, apellido FROM invitados ORDER BY nombre", [], (err, rows) => {
        if (err) {
            return res.status(500).send("Error al generar los links.");
        }

        // 1. Preparamos los datos para el Excel
        const datosParaExcel = rows.map(invitado => {
            return {
                Nombre: invitado.nombre,
                Apellido: invitado.apellido || '', // Aseguramos que no sea null
                Link: `https://quincevictoria.onrender.com/confirmar/${invitado.id}`
            };
        });

        // 2. Creamos una nueva hoja de cálculo a partir de los datos
        const hojaDeCalculo = XLSX.utils.json_to_sheet(datosParaExcel);

        // Opcional: Ajustar el ancho de las columnas
        hojaDeCalculo['!cols'] = [
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
    });
});

app.get("/admin/descargar-confirmaciones", checkAdmin, (req, res) => {
    const header = "Nombre,Apellido,Estado,Confirmados\n";
    db.all("SELECT nombre, apellido, estado, confirmados FROM invitados", [], (err, rows) => {
        if (err) return res.status(500).send("Error al generar archivo.");
        const contenido = rows.map(r => `${r.nombre},${r.apellido || ''},${r.estado},${r.confirmados}`).join("\n");
        res.setHeader("Content-disposition", "attachment; filename=confirmaciones.csv");
        res.setHeader("Content-Type", "text/csv");
        res.send(header + contenido);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));