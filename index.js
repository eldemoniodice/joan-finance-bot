require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// Se agregó "Suscripciones" a la lista oficial
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Diccionario estricto basado en tus definiciones exactas
    const prompt = `
      Actúa como un categorizador financiero experto. Tu única tarea es asignar una categoría al siguiente gasto: "${descripcion}".
      
      REGLAS ESTRICTAS:
      1. Responde EXCLUSIVAMENTE con UNA de estas categorías: ${MIS_CATEGORIAS.join(', ')}.
      2. Cero formato: no uses comillas, ni puntos, ni saltos de línea.
      3. Utiliza estrictamente este diccionario para clasificar:
         - "Alimentación Prim": Incluye verduras, frutas, lácteos, todo lo natural o mercado.
         - "Alimentación Secu": Incluye cena en restaurantes, golosinas, gaseosas, galletas, snacks, fideos, todo lo que no es natural ni saludable.
         - "Alquiler/Vivienda": Incluye compras para el hogar como electrodomésticos, accesorios de limpieza, bolsas.
         - "Gym & Deporte": Incluye todo lo relacionado a deporte como pichanga, creatina, proteína, partidos de futbol.
         - "Higiene Personal": Incluye desodorante, pasta dental, cremas, cepillos de dientes.
         - "Mascotas": Incluye todo lo relacionado con Gaia (perrita) y Salem (gatito).
         - "Ocio": Incluye cine, teatro, pasajes de bus fuera de Lima, pasajes de avión.
         - "Otros": Incluye regalos, regalos para mi novia Camila (flores, peluches), impresión de fotos, juegos de mesa, alquileres.
         - "Ropa": Ropa, zapatillas, indumentaria.
         - "Salud": Incluye pastillas, consultas médicas, farmacia.
         - "Suscripciones": Incluye Netflix, Canva, Muzzonly, Prime.
         - "Transporte": Incluye Taxis, Micros, Metropolitano y Tren.
      4. Si el gasto no encaja en ninguna, responde obligatoriamente "Otros".
    `;

    const result = await model.generateContent(prompt);
    const respuesta = result.response.text().trim();

    if (MIS_CATEGORIAS.includes(respuesta)) {
      return respuesta;
    } else {
      return 'Otros';
    }

  } catch (error) {
    console.error('Error usando Gemini:', error);
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

  // Ahora retornamos un objeto con todos los datos para armar el resumen en Telegram
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
    // Recibimos el objeto con la fila completa
    const datos = await registrarGasto(texto);

    // Armamos el resumen exacto de lo que se mandó a Sheets
    const mensajeResumen = `
✅ *Guardado en Google Sheets*

📊 *Resumen de la fila insertada:*
• *Col A (Fecha/Hora):* ${datos.fechaHora}
• *Col B (Fecha):* ${datos.fechaDia}
• *Col C (Detalle):* ${datos.descripcion}
• *Col D (Categoría):* ${datos.categoria}
• *Col E (Monto):* S/ ${datos.monto}
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

console.log('🔥 Bot con IA activo...');