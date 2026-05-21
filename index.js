process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

// ============================
// TELEGRAM BOT
// ============================

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

// ============================
// GOOGLE AUTH
// ============================

const auth = new google.auth.GoogleAuth({
  keyFile: 'joan-finance-612339531942.json', // <-- CAMBIA ESTO por el nombre REAL de tu JSON
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const spreadsheetId = process.env.SPREADSHEET_ID;

// ============================
// FUNCION REGISTRAR GASTO
// ============================

async function registrarGasto(texto) {

  const sheets = google.sheets({
    version: 'v4',
    auth
  });

  // Ejemplo esperado:
  // pollo 25

  const partes = texto.split(' ');

  // último valor = monto
  const monto = partes.pop();

  // resto = descripción
  const descripcion = partes.join(' ');

  const fecha = new Date().toLocaleDateString();

  // agregar fila al sheet
  await sheets.spreadsheets.values.append({

    spreadsheetId,

    range: 'Form_Responses1!A:E',

    valueInputOption: 'USER_ENTERED',

    requestBody: {

      values: [[

        new Date().toLocaleString(), // Marca temporal
        fecha,                       // Día
        descripcion,                 // Concepto
        'General',                   // Categoría
        monto                        // Monto

      ]]
    }
  });

}

// ============================
// TELEGRAM LISTENER
// ============================

bot.on('message', async (msg) => {

  const texto = msg.text;

  try {

    await registrarGasto(texto);

    bot.sendMessage(
      msg.chat.id,
      `✅ Gasto registrado:\n\n💸 ${texto}`
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