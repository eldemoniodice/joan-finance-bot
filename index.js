require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http'); // <-- NUEVO: Para el servidor fantasma

// ============================
// CONFIGURACIÓN INICIAL
// ============================

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
bot.deleteWebHook();

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const spreadsheetId = process.env.SPREADSHEET_ID;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================
// FUNCION DETECTAR CATEGORIA CON IA
// ============================

const MIS_CATEGORIAS = [
  'Alimentación Prim', 
  'Alimentación Secu', 
  'Alquiler/Vivienda', 
  'Gym & Deporte', 
  'Higiene Personal', 
  'Mascotas', 
  'Ocio', 
  'Otros',
  'Ropa',
  'Salud',
  'Suscripciones',
  'Transporte'
];

async function detectarCategoriaIA(descripcion) {
  try {
    // CAMBIO: Usamos la etiqueta -latest para evitar el error 404
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
      Actúa como un categorizador financiero experto. Tu única tarea es asignar una categoría al siguiente gasto: "${descripcion}".
      
      REGLAS ESTRICTAS:
      1. Responde EXCLUSIVAMENTE con UNA de estas categorías: ${MIS_CATEGORIAS.join(', ')}.
      2. Cero formato: no uses comillas, ni puntos, ni saltos de línea.
      3. Utiliza estrictamente este diccionario para clasificar:
         - "Alimentación Prim": verduras, frutas, lácteos, natural, mercado, despensa.
         - "Alimentación Secu": cena en restaurantes, chifa, golosinas, gaseosas, snacks, pedidos, no saludable, panes con queso, panes con palta, etc.
         - "Alquiler/Vivienda": compras hogar, electrodomésticos, limpieza, bolsas.
         - "Gym & Deporte": deporte, pichanga, creatina, proteína, futbol.
         - "Higiene Personal": desodorante, pasta dental, cremas, cepillos.
         - "Mascotas": Gaia, Salem, veterinaria, comida perro/gato.
         - "Ocio": cine, teatro, pasajes fuera de Lima, vuelos, diversión.
         - "Otros": regalos para Camila, flores, peluches, fotos, juegos, alquileres.
         - "Ropa": zapatillas, prendas, indumentaria.
         - "Salud": pastillas, farmacia, clínica, medico.
         - "Suscripciones": Netflix, Canva, Muzzonly, Prime.
         - "Transporte": Taxis, Uber, Micros, Metropolitano, Tren.
      4. Si el gasto no encaja en ninguna, responde obligatoriamente "Otros".
    `;

    const result = await model.generateContent(prompt);
    const respuesta = result.response.text().trim();
    
    console.log(`🤖 Texto: "${descripcion}" | IA Respondió: "${respuesta}"`);

    const categoriaEncontrada = MIS_CATEGORIAS.find(cat => 
      respuesta.toLowerCase().includes(cat.toLowerCase())
    );

    if (categoriaEncontrada) {
      return categoriaEncontrada;
    } else {
      console.log(`⚠️ No hizo match exacto. Asignando 'Otros'.`);
      return 'Otros';
    }

  } catch (error) {
    console.error('❌ Error CRÍTICO usando Gemini:', error);
    return 'Otros';
  }
}

// ============================
// FUNCION REGISTRAR GASTO
// ============================

async function registrarGasto(texto) {
  const sheets = google.sheets({ version: 'v4', auth });

  if (texto.startsWith('/')) return;

  const partes = texto.split(' ');
  const posibleMonto = partes.pop().replace(',', '.');
  const monto = parseFloat(posibleMonto);

  if (isNaN(monto)) {
    throw new Error('FORMATO_INVALIDO');
  }

  const descripcion = partes.join(' ');
  const categoria = await detectarCategoriaIA(descripcion);
  
  const fecha = new Date();
  const opcionesHora = { timeZone: 'America/Lima' };
  const opcionesFecha = { timeZone: 'America/Lima', day: 'numeric', month: 'numeric', year: 'numeric' };

  const fechaHoraStr = fecha.toLocaleString('es-PE', opcionesHora);
  const fechaDiaStr = fecha.toLocaleDateString('es-PE', opcionesFecha);

  const filaAInsertar = [
    fechaHoraStr,
    fechaDiaStr,
    descripcion,
    categoria,
    monto
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Respuestas de formulario 1'!A:E",
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [filaAInsertar]
    }
  });

  return {
    fechaHora: fechaHoraStr,
    fechaDia: fechaDiaStr,
    descripcion: descripcion,
    categoria: categoria,
    monto: monto
  };
}

// ============================
// TELEGRAM LISTENER
// ============================

bot.on('message', async (msg) => {
  const texto = msg.text;

  if (!texto) return;

  if (texto.startsWith('/')) {
    bot.sendMessage(msg.chat.id, '👋 Envíame un gasto así:\n\npollo a la brasa 25.50');
    return;
  }

  try {
    const datos = await registrarGasto(texto);

    const mensajeResumen = `
✅ *Guardado en Google Sheets*

📊 *Resumen:*
• *Detalle:* ${datos.descripcion}
• *Categoría:* ${datos.categoria}
• *Monto:* S/ ${datos.monto}
    `.trim();

    bot.sendMessage(msg.chat.id, mensajeResumen, { parse_mode: 'Markdown' });

  } catch (error) {
    if (error.message === 'FORMATO_INVALIDO') {
      bot.sendMessage(msg.chat.id, '❌ No reconocí el monto. Asegúrate de poner el número al final (ejemplo: taxi 15)');
    } else {
      console.error(error);
      bot.sendMessage(msg.chat.id, '❌ Error interno registrando el gasto.');
    }
  }
});

// ============================
// SERVIDOR FANTASMA (PARA RENDER)
// ============================
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('Bot de Gastos Activo 🚀');
  res.end();
}).listen(port, () => {
  console.log(`🌐 Servidor fantasma escuchando en puerto ${port} (Render feliz)`);
});

console.log('🔥 Bot con IA activo...');