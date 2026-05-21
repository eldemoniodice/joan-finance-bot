require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

// ============================
// TELEGRAM BOT
// ============================

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

// limpia webhooks viejos
bot.deleteWebHook();

// ============================
// GOOGLE AUTH
// ============================

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const spreadsheetId = process.env.SPREADSHEET_ID;

// ============================
// FUNCION DETECTAR CATEGORIA
// ============================

function detectarCategoria(descripcion) {

  const texto = descripcion.toLowerCase();

  if (
    texto.includes('pollo') ||
    texto.includes('almuerzo') ||
    texto.includes('comida') ||
    texto.includes('cena') ||
    texto.includes('desayuno')
  ) {
    return 'Comida';
  }

  if (
    texto.includes('uber') ||
    texto.includes('taxi') ||
    texto.includes('bus')
  ) {
    return 'Transporte';
  }

  if (
    texto.includes('netflix') ||
    texto.includes('spotify')
  ) {
    return 'Entretenimiento';
  }

  return 'General';
}

// ============================
// FUNCION REGISTRAR GASTO
// ============================

async function registrarGasto(texto) {

  const sheets = google.sheets({
    version: 'v4',
    auth
  });

  // ignorar comandos
  if (texto.startsWith('/')) {
    return;
  }

  // ejemplo:
  // pollo 25

  const partes = texto.split(' ');

  const monto = partes.pop();

  const descripcion = partes.join(' ');

  const categoria = detectarCategoria(descripcion);

  const fecha = new Date();

  await sheets.spreadsheets.values.append({

    spreadsheetId,

    range: "'Respuestas de formulario 1'!A:E",

    valueInputOption: 'USER_ENTERED',

    requestBody: {

      values: [[

        fecha.toLocaleString(),
        fecha.toLocaleDateString(),
        descripcion,
        categoria,
        monto

      ]]
    }
  });

}

// ============================
// TELEGRAM LISTENER
// ============================

bot.on('message', async (msg) => {

  const texto = msg.text;

  // ignorar comandos
  if (texto.startsWith('/')) {

    bot.sendMessage(
      msg.chat.id,
      '👋 Envíame un gasto así:\n\npollo 25'
    );

    return;
  }

  try {

    await registrarGasto(texto);

    bot.sendMessage(
      msg.chat.id,
      `✅ Gasto registrado\n\n💸 ${texto}`
    );

  } catch (error) {

    console.log(error);

    bot.sendMessage(
      msg.chat.id,
      '❌ Error registrando gasto'
    );

  }

});

// ============================
// INICIO
// ============================

console.log('🔥 Bot activo...');