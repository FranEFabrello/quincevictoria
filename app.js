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

const CLAVE_CORRECTA = "1234";

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
    if (req.path !== "/admin-login") return res.redirect("/admin-login");
    next();
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

app.get("/", (req, res) => {
    res.send("<h2>Bienvenido</h2><p>Este sitio es solo para confirmar asistencia.</p><p><a href='/admin'>Ir al panel</a></p>");
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

app.get("/confirmar/:id", (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM invitados WHERE id = ?", [id], (err, row) => {
        if (err || !row) return res.send("Invitado no encontrado.");
        if (row.estado !== "pendiente") return res.send("Ya respondiste a la invitación. ¡Gracias!");
        // Cambio realizado para renderizar la nueva vista
        res.render("invitacion", { invitado: row });
    });
});

app.post("/confirmar/:id", (req, res) => {
    const id = req.params.id;
    const { decision, confirmados } = req.body;
    if (!["confirmado", "rechazado"].includes(decision)) return res.send("Decisión inválida.");
    const confirmadosInt = parseInt(confirmados || 0);
    db.run("UPDATE invitados SET estado = ?, confirmados = ? WHERE id = ?", [decision, confirmadosInt, id], err => {
        if (err) return res.send("Error al guardar respuesta.");
        res.redirect("/gracias");
    });
});

app.get("/gracias", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "gracias.html"));
});


app.get("/admin/invitados", checkAdmin, (req, res) => {
    db.all("SELECT nombre, apellido, cantidad, confirmados, estado FROM invitados", [], (err, rows) => {
        if (err) return res.status(500).send("Error al leer invitados");
        let html = `<html><head><title>Lista</title>
        <style>
        body { font-family:sans-serif; padding:20px; }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:8px; border:1px solid #ccc; }
        th { background:#007bff; color:white; }
        tr:nth-child(even) { background:#f2f2f2; }
        .logout-btn { margin-top:30px; background:#dc3545; color:white; border:none; padding:10px 20px; font-size:16px; border-radius:4px; cursor:pointer; }
        </style></head><body><h1>Invitados</h1><table>
        <tr><th>Nombre</th><th>Apellido</th><th>Total</th><th>Confirmados</th><th>Estado</th></tr>`;
        for (const r of rows) {
            html += `<tr><td>${r.nombre}</td><td>${r.apellido}</td><td>${r.cantidad}</td><td>${r.confirmados}</td><td>${r.estado}</td></tr>`;
        }
        html += `</table>
        <form action="/admin-logout" method="get">
            <button class="logout-btn">Cerrar sesión</button>
        </form>
        </body></html>`;
        res.send(html);
    });
});

app.get("/admin/borrar-todo", checkAdmin, (req, res) => {
    db.run("DELETE FROM invitados", [], err => {
        if (err) return res.status(500).send("Error al borrar.");
        res.send("✅ Todos los datos fueron eliminados.");
    });
});

app.get("/admin/descargar-links", checkAdmin, (req, res) => {
    db.all("SELECT id, nombre, apellido FROM invitados", [], (err, rows) => {
        if (err) return res.status(500).send("Error al generar links.");
        const contenido = rows.map(r => `${r.nombre} ${r.apellido}: http://localhost:3000/confirmar/${r.id}`).join("\n");
        res.setHeader("Content-disposition", "attachment; filename=links.txt");
        res.setHeader("Content-Type", "text/plain");
        res.send(contenido);
    });
});

app.get("/admin/descargar-confirmaciones", checkAdmin, (req, res) => {
    db.all("SELECT nombre, apellido, estado, confirmados FROM invitados", [], (err, rows) => {
        if (err) return res.status(500).send("Error al generar archivo.");
        const contenido = rows.map(r => `${r.nombre},${r.apellido},${r.estado},${r.confirmados}`).join("\n");
        res.setHeader("Content-disposition", "attachment; filename=confirmaciones.csv");
        res.setHeader("Content-Type", "text/csv");
        res.send(contenido);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));