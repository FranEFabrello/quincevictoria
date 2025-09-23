const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const XLSX = require("xlsx");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });
const dbPath = path.join(__dirname, "database.db");
const db = new sqlite3.Database(dbPath);

const CLAVE_CORRECTA = process.env.ADMIN_PASSWORD || "Victoria2025**";

const corsOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || "clave-super-secreta";
const secureEnvValue = process.env.SESSION_SECURE;
const shouldUseSecureCookie = typeof secureEnvValue === "string"
    ? secureEnvValue === "true"
    : process.env.NODE_ENV === "production";
if (shouldUseSecureCookie) {
    app.set("trust proxy", 1);
}

const sameSiteConfig = process.env.SESSION_SAME_SITE || "none";
const sessionCookieConfig = {
    httpOnly: true,
    sameSite: sameSiteConfig,
    secure: shouldUseSecureCookie,
};

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookieConfig,
}));

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

const dbRun = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
        if (err) return reject(err);
        resolve(this);
    });
});

const dbGet = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
    });
});

const dbAll = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
    });
});

function normalizarTexto(texto) {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9\-]/g, "")
        .toLowerCase();
}

async function existeId(id) {
    const row = await dbGet("SELECT 1 FROM invitados WHERE id = ?", [id]);
    return Boolean(row);
}

function serializarInvitado(row) {
    if (!row) return null;
    return {
        id: row.id,
        nombre: row.nombre,
        apellido: row.apellido,
        cantidad: row.cantidad,
        confirmados: row.confirmados,
        estado: row.estado,
    };
}

function checkAdmin(req, res, next) {
    if (req.session && req.session.adminAutenticado) {
        return next();
    }
    return res.status(401).json({ ok: false, message: "Sesión de administrador requerida" });
}

app.get("/api/estado", async (req, res) => {
    try {
        const row = await dbGet("SELECT COUNT(*) as total FROM invitados");
        return res.json({
            ok: true,
            total: row ? row.total : 0,
            admin: Boolean(req.session && req.session.adminAutenticado),
        });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudo obtener el estado" });
    }
});

app.post("/api/admin/login", async (req, res) => {
    const { clave } = req.body;
    if (!clave) {
        return res.status(400).json({ ok: false, message: "Debes enviar la clave de acceso" });
    }

    if (clave !== CLAVE_CORRECTA) {
        return res.status(401).json({ ok: false, message: "Clave incorrecta" });
    }

    req.session.adminAutenticado = true;
    return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ ok: false, message: "No se pudo cerrar la sesión" });
        }
        res.clearCookie("connect.sid", sessionCookieConfig);
        return res.json({ ok: true });
    });
});

app.get("/api/confirmar/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const row = await dbGet("SELECT * FROM invitados WHERE id = ?", [id]);
        if (!row) {
            return res.status(404).json({
                ok: false,
                message: "El enlace de invitación no es válido.",
            });
        }

        const puedeResponder = row.estado === "pendiente";
        return res.json({
            ok: true,
            puedeResponder,
            invitado: serializarInvitado(row),
            message: puedeResponder ? null : "La invitación ya fue respondida.",
        });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudo obtener la invitación" });
    }
});

app.post("/api/confirmar/:id", async (req, res) => {
    const { id } = req.params;
    const { decision, confirmados } = req.body;

    if (!decision || !["confirmado", "rechazado"].includes(decision)) {
        return res.status(400).json({ ok: false, message: "Decisión inválida" });
    }

    try {
        const invitado = await dbGet("SELECT * FROM invitados WHERE id = ?", [id]);
        if (!invitado) {
            return res.status(404).json({ ok: false, message: "Invitado no encontrado" });
        }

        if (invitado.estado !== "pendiente") {
            return res.status(400).json({ ok: false, message: "La invitación ya fue respondida" });
        }

        const maxPersonas = invitado.cantidad || 0;
        const confirmadosInt = decision === "rechazado"
            ? 0
            : Math.max(0, Math.min(parseInt(confirmados, 10) || 0, maxPersonas));

        await dbRun("UPDATE invitados SET estado = ?, confirmados = ? WHERE id = ?", [decision, confirmadosInt, id]);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "Error al guardar la confirmación" });
    }
});

app.get("/api/invitados", checkAdmin, async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM invitados ORDER BY nombre");
        let totalInvitados = 0;
        let confirmados = 0;
        let pendientes = 0;
        let rechazados = 0;

        rows.forEach(row => {
            totalInvitados += row.cantidad || 0;
            confirmados += row.confirmados || 0;
            if (row.estado === "pendiente") pendientes += 1;
            if (row.estado === "rechazado") rechazados += 1;
        });

        return res.json({
            ok: true,
            invitados: rows.map(serializarInvitado),
            resumen: {
                grupos: rows.length,
                totalInvitados,
                confirmados,
                pendientes,
                rechazados,
            },
        });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudo obtener el listado" });
    }
});

app.put("/api/invitados/:id", checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, cantidad, confirmados, estado } = req.body;

    if (!nombre || typeof nombre !== "string") {
        return res.status(400).json({ ok: false, message: "El nombre es obligatorio" });
    }

    const estadosPermitidos = ["pendiente", "confirmado", "rechazado"];
    if (estado && !estadosPermitidos.includes(estado)) {
        return res.status(400).json({ ok: false, message: "Estado inválido" });
    }

    const cantidadInt = parseInt(cantidad, 10);
    const confirmadosInt = parseInt(confirmados, 10);

    try {
        const invitado = await dbGet("SELECT * FROM invitados WHERE id = ?", [id]);
        if (!invitado) {
            return res.status(404).json({ ok: false, message: "Invitado no encontrado" });
        }

        await dbRun(
            `UPDATE invitados SET nombre = ?, apellido = ?, cantidad = ?, confirmados = ?, estado = ? WHERE id = ?`,
            [
                nombre,
                apellido || null,
                Number.isNaN(cantidadInt) ? invitado.cantidad : cantidadInt,
                Number.isNaN(confirmadosInt) ? invitado.confirmados : confirmadosInt,
                estado || invitado.estado,
                id,
            ],
        );

        const actualizado = await dbGet("SELECT * FROM invitados WHERE id = ?", [id]);
        return res.json({ ok: true, invitado: serializarInvitado(actualizado) });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudo actualizar el invitado" });
    }
});

app.delete("/api/invitados", checkAdmin, async (req, res) => {
    try {
        await dbRun("DELETE FROM invitados");
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudo borrar la información" });
    }
});

app.post("/api/invitados/upload", checkAdmin, upload.single("excel"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, message: "Debes adjuntar un archivo" });
    }

    let inserted = 0;
    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const datos = XLSX.utils.sheet_to_json(sheet);

        for (const fila of datos) {
            const idBase = normalizarTexto(`${fila.Nombre || ""}-${fila.Apellido || ""}`);
            let id = idBase || `invitado-${Date.now()}`;
            let contador = 1;
            // eslint-disable-next-line no-await-in-loop
            while (await existeId(id)) {
                id = idBase
                    ? `${idBase}-${contador++}`
                    : `invitado-${Date.now()}-${contador++}`;
            }

            await dbRun(
                "INSERT INTO invitados (id, nombre, apellido, cantidad, estado, confirmados) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    id,
                    fila.Nombre || null,
                    fila.Apellido || null,
                    parseInt(fila.Cantidad, 10) || 0,
                    "pendiente",
                    0,
                ],
            );
            inserted += 1;
        }

        await fs.promises.unlink(req.file.path);
        return res.json({ ok: true, insertados: inserted });
    } catch (error) {
        if (req.file) {
            await fs.promises.unlink(req.file.path).catch(() => {});
        }
        return res.status(500).json({ ok: false, message: "No se pudo procesar el archivo" });
    }
});

app.get("/api/invitados/export/links", checkAdmin, async (req, res) => {
    try {
        const invitados = await dbAll("SELECT id, nombre, apellido FROM invitados ORDER BY nombre");
        const baseUrl = (process.env.INVITE_BASE_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "");

        const links = invitados.map(invitado => ({
            nombre: invitado.nombre,
            apellido: invitado.apellido || "",
            link: baseUrl ? `${baseUrl}/confirmar/${invitado.id}` : `/confirmar/${invitado.id}`,
        }));

        return res.json({ ok: true, links });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudieron generar los links" });
    }
});

app.get("/api/invitados/export/confirmaciones", checkAdmin, async (req, res) => {
    try {
        const confirmaciones = await dbAll("SELECT nombre, apellido, estado, confirmados FROM invitados");
        return res.json({ ok: true, confirmaciones });
    } catch (error) {
        return res.status(500).json({ ok: false, message: "No se pudieron obtener las confirmaciones" });
    }
});

app.use((err, req, res, next) => {
    if (err && err.message && err.message.includes("CORS")) {
        return res.status(403).json({ ok: false, message: "Origen no permitido" });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ ok: false, message: "Error inesperado" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 API lista en http://localhost:${PORT}`);
});
