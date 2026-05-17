const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT  10000; 

// НАСТРОЙКА CORS
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.sendStatus(200);
});

app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 150 * 1024 * 1024 } 
});

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// ГЛАВНЫЙ РОУТ ЗАГРУЗКИ
app.post('/upload', upload.any(), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log("\n=== [RENDER] ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ===");
  
  const file = req.files && req.files[0];
  if (!file) {
    console.error("❌ Файл не найден в запросе!");
    return res.status(400).json({ error: 'Файл не найден в запросе фронтенда' });
  }

  console.log(`📂 Файл: "${file.originalname}" | Ключ: "${file.fieldname}" | Размер: ${(file.size / (1024 * 1024)).toFixed(2)} МБ`);

  if (!TG_BOT_TOKEN  !TG_CHAT_ID) {
    console.error("❌ Ошибка: Переменные окружения не заданы!");
    return res.status(500).json({ error: 'Бэкенд не настроен в Переменных Окружения.' });
  }

  try {
    // Используем встроенный в Node.js FormData, чтобы не конфликтовать со старыми библиотеками
    const nodeFormData = new globalThis.FormData();
    nodeFormData.append('chat_id', TG_CHAT_ID);
    
    const safeName = ${Date.now()}-${file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")};
    
    // Переводим буфер в Blob для отправки через fetch
    const fileBlob = new Blob([file.buffer], { type: 'application/octet-stream' });
    nodeFormData.append('document', fileBlob, safeName);

    console.log("🚀 Отправка файла в Telegram API...");

    // Чистый fetch без ручных headers — Node.js сам выставит нужные границы (boundary)
    const response = await fetch(https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument, {
      method: 'POST',
      body: nodeFormData
    });

    const resData = await response.json();

    if (!response.ok  !resData.ok) {
      console.error("❌ Telegram отклонил запрос:", JSON.stringify(resData));
      return res.status(500).json({ error: resData.description  'Telegram Reject' });
    }

    console.log("🎉 Telegram успешно принял файл!");

    let fileId = null;
    if (resData.result.document) {
      fileId = resData.result.document.file_id;
    } else if (resData.result.photo) {
      const photos = resData.result.photo;
      fileId = photos[photos.length - 1].file_id;
    } else if (resData.result.audio) {
      fileId = resData.result.audio.file_id;
    }

    if (!fileId) {
      throw new Error('Telegram не вернул file_id для загруженного типа контента');
    }

    const pathResponse = await fetch(https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fileId});
    const pathData = await pathResponse.json();
    
    if (pathData.ok) {
      const filePath = pathData.result.file_path;
      
      // Генерируем безопасную прокси-ссылку
      const downloadUrl = https://${req.get('host')}/file/${filePath};
      console.log(🔗 Безопасная ссылка сгенерирована: ${downloadUrl}\n);
      return res.json({ success: true, url: downloadUrl });
    }

    throw new Error('Не удалось получить путь файла от Telegram через getFile');
  } catch (error) {
    console.error('💥 Критический сбой внутри /upload:', error.message);
    return res.status(500).json({ error: error.message });
  }
});
// БЕЗОПАСНЫЙ ПРОКСИ-РОУТ ДЛЯ СКАЧИВАНИЯ ФАЙЛОВ
app.get('/file/*', async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const filePath = req.params[0]; 
    
    if (!TG_BOT_TOKEN) return res.status(500).send("Токен бота отсутствует");

    const response = await fetch(https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath});
    
    if (!response.ok) return res.status(response.status).send("Файл не найден в Telegram");

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send('IvPlay Бэкенд на Render Работает Идеально!');
});

app.listen(PORT, () => {
  console.log(🚀 Сервер успешно запущен на порту ${PORT});
});
