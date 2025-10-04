const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const XLSX = require("xlsx");
const session = require("express-session");
const compression = require("compression");
const db = require("./db/client");
const aiConfig = require("./config/ai");

const app = express();
const upload = multer({ dest: "uploads/" });
const ESTADOS_VALIDOS = new Set(["pendiente", "confirmado", "rechazado"]);
const isProduction = process.env.NODE_ENV === "production";
const eventCostPerPersonARS = Number.parseFloat(process.env.EVENT_COSTO_POR_INVITADO_ARS || "0") || 0;
const eventCapacityPlanned = Number.parseInt(process.env.EVENT_CAPACIDAD_MAXIMA || "0", 10) || 0;

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

if (!aiConfig.isConfigured) {
    const missingVars = aiConfig.missing.length ? aiConfig.missing.join(", ") : "AI_API_KEY, AI_MODEL";
    console.warn(`[IA] Configuración incompleta. Definí las variables: ${missingVars}.`);
}

app.locals.ai = aiConfig.getPublicConfig();

function checkAdmin(req, res, next) {
    if (req.session && req.session.adminAutenticado) return next();
    // Permite el acceso a la página de login sin estar autenticado
    if (req.path === "/admin-login" || req.path === "/admin-login/") return next();
    res.redirect("/admin-login");
}

function wantsJson(req) {
    const accept = req.headers.accept || "";
    return req.xhr || accept.includes("application/json");
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundTo(value, digits) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function buildAnalytics(invitados) {
    const totalGrupos = Array.isArray(invitados) ? invitados.length : 0;
    let totalPersonas = 0;
    let totalConfirmados = 0;
    let gruposPendientes = 0;
    let gruposConfirmados = 0;
    let gruposRechazados = 0;
    let personasPendientes = 0;
    let personasRechazadas = 0;
    let gruposConAsistenciaParcial = 0;

    for (const invitado of invitados || []) {
        const cantidad = toNumber(invitado?.cantidad);
        const confirmados = toNumber(invitado?.confirmados);
        const estado = (invitado?.estado || "").toLowerCase();

        totalPersonas += cantidad;
        totalConfirmados += confirmados;

        if (estado === "pendiente") {
            gruposPendientes += 1;
            personasPendientes += Math.max(cantidad - confirmados, 0);
        } else if (estado === "confirmado") {
            gruposConfirmados += 1;
            if (confirmados < cantidad) {
                gruposConAsistenciaParcial += 1;
                personasPendientes += Math.max(cantidad - confirmados, 0);
            }
        } else if (estado === "rechazado") {
            gruposRechazados += 1;
            personasRechazadas += cantidad;
        } else {
            personasPendientes += Math.max(cantidad - confirmados, 0);
        }
    }

    const gruposRespondieron = gruposConfirmados + gruposRechazados;
    const capacidadDisponible = Math.max(totalPersonas - totalConfirmados, 0);
    const porcentajeConfirmacion = totalPersonas > 0 ? roundTo((totalConfirmados / totalPersonas) * 100, 1) : 0;
    const porcentajeRespuesta = totalGrupos > 0 ? roundTo((gruposRespondieron / totalGrupos) * 100, 1) : 0;
    const promedioPersonasGrupo = totalGrupos > 0 ? roundTo(totalPersonas / totalGrupos, 1) : 0;
    const promedioAsistentesPorGrupoConfirmado = gruposConfirmados > 0 ? roundTo(totalConfirmados / gruposConfirmados, 1) : 0;

    const capacidadRestanteEvento = eventCapacityPlanned > 0
        ? Math.max(eventCapacityPlanned - totalConfirmados, 0)
        : 0;
    const porcentajeOcupacionPlaneada = eventCapacityPlanned > 0
        ? roundTo((totalConfirmados / eventCapacityPlanned) * 100, 1)
        : 0;

    const costoConfirmadosARS = eventCostPerPersonARS > 0 ? roundTo(totalConfirmados * eventCostPerPersonARS, 2) : 0;
    const costoPendienteARS = eventCostPerPersonARS > 0 ? roundTo(personasPendientes * eventCostPerPersonARS, 2) : 0;

    return {
        totalGrupos,
        totalPersonas,
        confirmados: totalConfirmados,
        pendientes: gruposPendientes,
        rechazados: gruposRechazados,
        personasPendientes,
        personasRechazadas,
        capacidadDisponible,
        porcentajeConfirmacion,
        porcentajeRespuesta,
        gruposRespondieron,
        gruposConAsistenciaParcial,
        promedioPersonasGrupo,
        promedioAsistentesPorGrupoConfirmado,
        costoPorPersonaARS: eventCostPerPersonARS,
        costoConfirmadosARS,
        costoPendienteARS,
        capacidadPlaneada: eventCapacityPlanned,
        capacidadRestanteEvento,
        porcentajeOcupacionPlaneada,
        distribucionGrupos: {
            confirmado: gruposConfirmados,
            pendiente: gruposPendientes,
            rechazado: gruposRechazados
        },
        distribucionPersonas: {
            confirmadas: totalConfirmados,
            pendientes: personasPendientes,
            rechazadas: personasRechazadas
        }
    };
}

function normalizarNumero(valor) {
    const numero = Number.parseInt(valor, 10);
    return Number.isNaN(numero) ? null : numero;
}

function validarRegistroInvitado(registro, indice, idsVistos) {
    const resultado = { errores: [], inconsistencias: [] };
    if (typeof registro !== "object" || registro === null || Array.isArray(registro)) {
        resultado.errores.push(`El elemento en la posición ${indice} no es un objeto válido.`);
        return resultado;
    }

    const camposRequeridos = ["id", "nombre", "apellido", "cantidad", "confirmados", "estado"];
    for (const campo of camposRequeridos) {
        if (!Object.prototype.hasOwnProperty.call(registro, campo)) {
            resultado.errores.push(`Falta el campo obligatorio "${campo}" en la posición ${indice}.`);
        }
    }

    const { id, nombre, apellido, cantidad, confirmados, estado } = registro;

    if (typeof id !== "string" || !id.trim()) {
        resultado.errores.push(`El campo "id" debe ser un texto no vacío (posición ${indice}).`);
    } else if (idsVistos.has(id)) {
        resultado.inconsistencias.push(`El id "${id}" está duplicado en la posición ${indice}.`);
    } else {
        idsVistos.add(id);
    }

    if (typeof nombre !== "string") {
        resultado.errores.push(`El campo "nombre" debe ser texto (posición ${indice}).`);
    }

    if (apellido !== null && apellido !== undefined && typeof apellido !== "string") {
        resultado.errores.push(`El campo "apellido" debe ser texto o null (posición ${indice}).`);
    }

    const cantidadNumero = normalizarNumero(cantidad);
    if (cantidadNumero === null || cantidadNumero < 0) {
        resultado.errores.push(`La "cantidad" debe ser un número entero mayor o igual a 0 (posición ${indice}).`);
    }

    const confirmadosNumero = normalizarNumero(confirmados);
    if (confirmadosNumero === null || confirmadosNumero < 0) {
        resultado.errores.push(`"confirmados" debe ser un número entero mayor o igual a 0 (posición ${indice}).`);
    }

    if (typeof estado !== "string" || !ESTADOS_VALIDOS.has(estado.toLowerCase())) {
        resultado.errores.push(`El campo "estado" no es válido en la posición ${indice}.`);
    } else if (estado !== estado.toLowerCase()) {
        registro.estado = estado.toLowerCase();
    }

    if (cantidadNumero !== null && confirmadosNumero !== null && confirmadosNumero > cantidadNumero) {
        resultado.inconsistencias.push(`El campo "confirmados" no puede ser mayor a "cantidad" (posición ${indice}).`);
    }

    return resultado;
}

function validarRespaldo(data) {
    if (!Array.isArray(data)) {
        return { esValido: false, errores: ["El respaldo debe ser un array de invitados."], inconsistencias: [] };
    }

    const errores = [];
    const inconsistencias = [];
    const idsVistos = new Set();

    data.forEach((registro, indice) => {
        const resultado = validarRegistroInvitado(registro, indice, idsVistos);
        errores.push(...resultado.errores);
        inconsistencias.push(...resultado.inconsistencias);
    });

    return { esValido: errores.length === 0 && inconsistencias.length === 0, errores, inconsistencias };
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

app.post("/admin/restaurar-backup", checkAdmin, upload.single("backup"), async (req, res) => {
    const expectsJson = wantsJson(req);
    const archivo = req.file;

    const responder = (status, payload, query) => {
        if (archivo) {
            fsp.unlink(archivo.path).catch(() => {});
        }
        if (expectsJson) {
            return res.status(status).json(payload);
        }
        const redirectUrl = query ? `/admin/invitados?restore=${query}` : "/admin/invitados";
        return res.redirect(redirectUrl);
    };

    if (!archivo) {
        return responder(400, { ok: false, error: "No se envió ningún archivo para restaurar." }, "missing");
    }

    let contenido;
    try {
        contenido = await fsp.readFile(archivo.path, "utf8");
    } catch (error) {
        console.error("No se pudo leer el archivo de respaldo:", error);
        return responder(500, { ok: false, error: "No se pudo leer el archivo de respaldo." }, "error");
    }

    let datos;
    try {
        datos = JSON.parse(contenido);
    } catch (error) {
        return responder(400, { ok: false, error: "El archivo no contiene un JSON válido." }, "invalid");
    }

    const { esValido, errores, inconsistencias } = validarRespaldo(datos);
    if (!esValido) {
        if (errores.length > 0) {
            const payload = { ok: false, error: "El respaldo contiene errores de validación.", detalles: errores };
            return responder(422, payload, "invalid");
        }

        const payload = { ok: false, error: "Se detectaron inconsistencias en los datos del respaldo.", detalles: inconsistencias };
        return responder(409, payload, "inconsistent");
    }

    try {
        await db.transaction(async (trx) => {
            await trx.query("DELETE FROM invitados");

            for (const registro of datos) {
                const cantidadNumero = normalizarNumero(registro.cantidad) ?? 0;
                const confirmadosNumero = normalizarNumero(registro.confirmados) ?? 0;
                const estadoNormalizado = (registro.estado || "pendiente").toLowerCase();

                await trx.query(
                    "INSERT INTO invitados (id, nombre, apellido, cantidad, confirmados, estado) VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        registro.id,
                        typeof registro.nombre === "string" ? registro.nombre : null,
                        registro.apellido === null || typeof registro.apellido === "string" ? registro.apellido : null,
                        cantidadNumero,
                        confirmadosNumero,
                        ESTADOS_VALIDOS.has(estadoNormalizado) ? estadoNormalizado : "pendiente"
                    ]
                );
            }
        });
    } catch (error) {
        console.error("Error al restaurar el respaldo:", error);
        return responder(500, { ok: false, error: "Ocurrió un error al aplicar la restauración." }, "error");
    }

    return responder(200, { ok: true, message: "Respaldo restaurado correctamente." }, "success");
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

    const resumenImportacion = {
        status: "success",
        inserted: 0,
        updated: 0,
        skipped: 0,
        conflicts: [],
        errors: []
    };

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
            const registrosExistentes = await trx.many("SELECT id, nombre, apellido, cantidad, estado, confirmados FROM invitados");
            const idsUtilizados = new Set();
            const registrosPorBase = new Map();

            const claveBaseVacia = "__sin_nombre__";

            for (const existente of registrosExistentes) {
                idsUtilizados.add(existente.id);
                const base = normalizarTexto(`${existente.nombre || ""}-${existente.apellido || ""}`) || claveBaseVacia;
                const lista = registrosPorBase.get(base) || [];
                lista.push({ ...existente, base });
                registrosPorBase.set(base, lista);
            }

            let contadorGenerico = registrosExistentes.length + 1;

            for (const fila of datos) {
                const nombre = typeof fila.Nombre === "string" ? fila.Nombre.trim() : (typeof fila.nombre === "string" ? fila.nombre.trim() : null);
                const apellido = typeof fila.Apellido === "string" ? fila.Apellido.trim() : (typeof fila.apellido === "string" ? fila.apellido.trim() : null);

                let baseNormalizada = normalizarTexto(`${nombre || ""}-${apellido || ""}`);
                if (!baseNormalizada) {
                    baseNormalizada = claveBaseVacia;
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

                const candidatos = registrosPorBase.get(baseNormalizada) || [];

                if (candidatos.length > 1) {
                    resumenImportacion.conflicts.push({
                        tipo: "multiple",
                        nombre: nombre || "",
                        apellido: apellido || "",
                        base: baseNormalizada === claveBaseVacia ? "sin-identificador" : baseNormalizada,
                        ids: candidatos.map((c) => c.id)
                    });
                    resumenImportacion.skipped += 1;
                    continue;
                }

                const coincidencia = candidatos[0];

                if (coincidencia) {
                    const cambios = {};
                    const nombreActual = coincidencia.nombre || "";
                    const apellidoActual = coincidencia.apellido || "";
                    const cantidadActual = Number.parseInt(coincidencia.cantidad, 10) || 0;

                    if ((nombre || "") !== nombreActual) {
                        cambios.nombre = { antes: nombreActual, despues: nombre || "" };
                    }
                    if ((apellido || "") !== apellidoActual) {
                        cambios.apellido = { antes: apellidoActual, despues: apellido || "" };
                    }
                    if (cantidadNormalizada !== cantidadActual) {
                        cambios.cantidad = { antes: cantidadActual, despues: cantidadNormalizada };
                    }

                    if (Object.keys(cambios).length > 0) {
                        await trx.query(
                            "UPDATE invitados SET nombre = ?, apellido = ?, cantidad = ? WHERE id = ?",
                            [nombre || null, apellido || null, cantidadNormalizada, coincidencia.id]
                        );

                        coincidencia.nombre = nombre || null;
                        coincidencia.apellido = apellido || null;
                        coincidencia.cantidad = cantidadNormalizada;

                        resumenImportacion.updated += 1;
                        resumenImportacion.conflicts.push({
                            tipo: "actualizado",
                            id: coincidencia.id,
                            nombre: nombre || "",
                            apellido: apellido || "",
                            cambios
                        });
                    } else {
                        resumenImportacion.skipped += 1;
                    }

                    continue;
                }

                let idBase = baseNormalizada === claveBaseVacia ? "invitado" : baseNormalizada;
                if (!idBase) {
                    idBase = "invitado";
                }

                let id = idBase;
                let sufijo = 1;
                while (idsUtilizados.has(id)) {
                    id = `${idBase}-${sufijo++}`;
                }

                if (!id || idsUtilizados.has(id)) {
                    id = `invitado-${contadorGenerico++}`;
                    while (idsUtilizados.has(id)) {
                        id = `invitado-${contadorGenerico++}`;
                    }
                }

                await trx.query(
                    "INSERT INTO invitados (id, nombre, apellido, cantidad, estado, confirmados) VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        id,
                        nombre || null,
                        apellido || null,
                        cantidadNormalizada,
                        "pendiente",
                        0
                    ]
                );

                idsUtilizados.add(id);
                const nuevoRegistro = {
                    id,
                    nombre: nombre || null,
                    apellido: apellido || null,
                    cantidad: cantidadNormalizada,
                    estado: "pendiente",
                    confirmados: 0
                };
                registrosPorBase.set(baseNormalizada, [nuevoRegistro]);
                resumenImportacion.inserted += 1;
            }
        });

        await fsp.unlink(filePath).catch(() => {});
        req.session.importSummary = resumenImportacion;
        res.redirect("/admin/invitados?import=summary");
    } catch (error) {
        console.error("Error al procesar la importación:", error);
        await fsp.unlink(filePath).catch(() => {});

        resumenImportacion.status = "error";
        resumenImportacion.message = "Ocurrió un error al procesar la importación.";
        req.session.importSummary = resumenImportacion;
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
        const estadoParam = typeof req.query.estado === "string" ? req.query.estado.trim().toLowerCase() : "";
        const estadosValidos = new Set(["pendiente", "confirmado", "rechazado"]);
        const estadoSeleccionado = estadosValidos.has(estadoParam) ? estadoParam : "todos";

        const condiciones = [];
        const parametros = [];

        if (termino) {
            const likeTerm = `%${termino}%`;
            condiciones.push("(nombre LIKE ? OR apellido LIKE ?)");
            parametros.push(likeTerm, likeTerm);
        }

        if (estadoSeleccionado !== "todos") {
            condiciones.push("estado = ?");
            parametros.push(estadoSeleccionado);
        }

        const whereClause = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
        const sql = `SELECT * FROM invitados ${whereClause} ORDER BY nombre`;
        const invitados = await db.many(sql, parametros);
        const analytics = buildAnalytics(invitados);

        const totalInvitados = analytics.totalPersonas;
        const confirmados = analytics.confirmados;
        const pendientes = analytics.distribucionGrupos.pendiente;
        const rechazados = analytics.distribucionGrupos.rechazado;
        const baseUrl = req.protocol + "://" + req.get("host");

        const mensajeExito = req.query.exito === "1" ? "Invitado eliminado correctamente." : null;
        const mensajeReset = req.query.reset === "1" ? "Se eliminaron todos los registros correctamente." : null;
        let mensajeImportacion = null;
        let mensajeRestauracion = null;

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
            case "summary":
                mensajeImportacion = null;
                break;
            default:
                mensajeImportacion = null;
        }

        switch (req.query.restore) {
            case "success":
                mensajeRestauracion = { tipo: "exito", texto: "Respaldo restaurado correctamente." };
                break;
            case "missing":
                mensajeRestauracion = { tipo: "error", texto: "Debés seleccionar un archivo JSON para restaurar." };
                break;
            case "invalid":
                mensajeRestauracion = { tipo: "error", texto: "El archivo de respaldo no tiene el formato esperado." };
                break;
            case "inconsistent":
                mensajeRestauracion = { tipo: "warning", texto: "Se detectaron inconsistencias en el respaldo. Revisá los datos." };
                break;
            case "error":
                mensajeRestauracion = { tipo: "error", texto: "Ocurrió un error al restaurar el respaldo. Intentá nuevamente." };
                break;
            default:
                mensajeRestauracion = null;
        }

        const alerts = [];
        let importSummaryData = null;

        if (req.session.importSummary) {
            importSummaryData = req.session.importSummary;
            delete req.session.importSummary;
        }

        if (mensajeImportacion && !importSummaryData) {
            alerts.push({ tipo: mensajeImportacion.tipo, texto: mensajeImportacion.texto });
        }
        if (mensajeExito) {
            alerts.push({ tipo: "exito", texto: mensajeExito });
        }
        if (mensajeRestauracion) {
            alerts.push({ tipo: mensajeRestauracion.tipo, texto: mensajeRestauracion.texto });
        }

        if (importSummaryData) {
            if (importSummaryData.status === "success") {
                alerts.push({
                    tipo: "exito",
                    texto: `Importación completada: ${importSummaryData.inserted} nuevos, ${importSummaryData.updated} actualizados, ${importSummaryData.skipped} sin cambios.`
                });

                const describirConflicto = (conflicto) => {
                    if (conflicto.tipo === "actualizado") {
                        const nombreCompleto = `${conflicto.nombre || ""} ${conflicto.apellido || ""}`.trim() || conflicto.id;
                        const partes = [];
                        if (conflicto.cambios.nombre) {
                            partes.push(`nombre: "${conflicto.cambios.nombre.antes}" → "${conflicto.cambios.nombre.despues}"`);
                        }
                        if (conflicto.cambios.apellido) {
                            partes.push(`apellido: "${conflicto.cambios.apellido.antes}" → "${conflicto.cambios.apellido.despues}"`);
                        }
                        if (conflicto.cambios.cantidad) {
                            partes.push(`cantidad: ${conflicto.cambios.cantidad.antes} → ${conflicto.cambios.cantidad.despues}`);
                        }
                        const descripcionCambios = partes.join(", ");
                        return `Actualizado ${nombreCompleto}: ${descripcionCambios}.`;
                    }

                    if (conflicto.tipo === "multiple") {
                        const nombreCompleto = `${conflicto.nombre || ""} ${conflicto.apellido || ""}`.trim() || conflicto.base;
                        return `Conflicto para ${nombreCompleto}: existen ${conflicto.ids.length} registros (${conflicto.ids.join(", ")}).`;
                    }

                    return null;
                };

                const conflictosDescritos = (importSummaryData.conflicts || []).map(describirConflicto).filter(Boolean);
                if (conflictosDescritos.length > 0) {
                    const limite = 5;
                    const visibles = conflictosDescritos.slice(0, limite);
                    let textoConflictos = `Conflictos detectados (${conflictosDescritos.length}): ${visibles.join(" ")}`;
                    if (conflictosDescritos.length > limite) {
                        textoConflictos += ` Y ${conflictosDescritos.length - limite} conflicto(s) adicional(es).`;
                    }
                    alerts.push({ tipo: "warning", texto: textoConflictos });
                }

                for (const error of importSummaryData.errors || []) {
                    alerts.push({ tipo: "error", texto: error });
                }
            } else if (importSummaryData.status === "error") {
                alerts.push({ tipo: "error", texto: importSummaryData.message || "Ocurrió un error al procesar la importación." });
            }
        }

        if (wantsJson(req)) {
            return res.json({
                ok: true,
                invitados,
                stats: analytics,
                ai: aiConfig.getPublicConfig(),
                baseUrl,
                termino: termino || "",
                estadoSeleccionado,
                alerts,
                importSummary: importSummaryData
            });
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
            mensajeRestauracion,
            termino,
            estadoSeleccionado,
            alerts,
            importSummary: importSummaryData,
            stats: analytics,
            ai: aiConfig.getPublicConfig()
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
    const expectsJson = wantsJson(req);

    try {
        const resultado = await db.query("DELETE FROM invitados WHERE id = ?", [id]);

        if (resultado && resultado.affectedRows === 0) {
            if (expectsJson) {
                return res.status(404).json({
                    ok: false,
                    error: "El invitado que intentás eliminar no existe."
                });
            }

            return res.status(404).render("mensaje", {
                titulo: "Invitado no encontrado",
                tituloH1: "No se encontró el invitado",
                mensaje: "El invitado que intentás eliminar no existe."
            });
        }

        if (expectsJson) {
            return res.json({
                ok: true,
                message: "Invitado eliminado correctamente."
            });
        }

        res.redirect("/admin/invitados?exito=1");
    } catch (error) {
        console.error("Error al eliminar invitado:", error);
        if (expectsJson) {
            return res.status(500).json({
                ok: false,
                error: "Ocurrió un problema al eliminar el invitado. Intentá nuevamente."
            });
        }

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
