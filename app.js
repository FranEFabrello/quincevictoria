const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();
const upload = multer({ dest: "uploads/" });
const db = new sqlite3.Database("database.db");

const CLAVE_CORRECTA = "Victoria2025**";

app.use(session({
    secret: "clave-super-secreta",
    resave: false,
    saveUninitialized: false
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));


app.use("/assets", express.static(path.join(__dirname, "assets")));



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

app.post("/upload", upload.single("excel"), async (req, res) => {
    const workbook = XLSX.readFile(req.file.path);
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const datos = XLSX.utils.sheet_to_json(hoja);

    for (const fila of datos) {
        const idBase = normalizarTexto((fila.Nombre || "") + "-" + (fila.Apellido || ""));
        let id = idBase;
        let contador = 1;
        while (await existeId(id)) {
            id = idBase + "-" + contador++;
        }

        db.run("INSERT INTO invitados (id, nombre, apellido, cantidad, estado, confirmados) VALUES (?, ?, ?, ?, ?, ?)", [
            id, fila.Nombre, fila.Apellido, fila.Cantidad, "pendiente", 0
        ]);
    }

    fs.unlinkSync(req.file.path);
    res.redirect("/admin");
});

// RUTA DE CONFIRMACIÓN MODIFICADA (Esta es la sección a reemplazar)
app.get("/confirmar/:id", (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM invitados WHERE id = ?", [id], (err, row) => {
        if (err || !row) {
            // Si hay un error o no se encuentra el invitado, mostramos un mensaje.
            return res.status(404).render("mensaje", {
                titulo: "Error",
                tituloH1: "Invitación no encontrada",
                mensaje: "El enlace que utilizaste no parece ser válido. Por favor, verifica el link o contacta a los organizadores."
            });
        }

        // --- ¡AQUÍ ESTÁ LA LÓGICA CLAVE! ---
        // Verificamos si el estado ya no es "pendiente".
        if (row.estado !== "pendiente") {
            // Si la invitación ya fue respondida, renderizamos la página de mensaje.
            return res.render("mensaje", {
                titulo: "Invitación ya Respondida",
                tituloH1: "¡Gracias por tu respuesta!",
                mensaje: "Ya hemos registrado tu respuesta para esta invitación. Si necesitas hacer algún cambio, por favor contacta a los organizadores."
            });
        }

        // Si todo está bien y sigue pendiente, mostramos la invitación normal.
        res.render("invitacion", { invitado: row });
    });
});


// RUTA POST (ya está correcta, la incluyo para dar contexto)
app.post("/confirmar/:id", (req, res) => {
    const id = req.params.id;
    const { decision, confirmados } = req.body;
    if (!["confirmado", "rechazado"].includes(decision)) return res.send("Decisión inválida.");

    const confirmadosInt = decision === 'rechazado' ? 0 : parseInt(confirmados || 0);

    db.run("UPDATE invitados SET estado = ?, confirmados = ? WHERE id = ?", [decision, confirmadosInt, id], err => {
        if (err) return res.send("Error al guardar respuesta.");
        res.redirect("/gracias");
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

        res.render("admin_invitados", {
            invitados: rows,
            totalInvitados,
            confirmados,
            pendientes,
            rechazados
        });
    });
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