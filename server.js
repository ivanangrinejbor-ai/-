const express = require('express');
const multer = require('multer');
const cors = require('cors');
const FormData = require('form-data');

const app = express();
// На Render порт выдается динамически через process.env.PORT
const PORT = process.env.PORT || 10000; 

// Жесткая и полная настройка CORS для любых доменов
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());
app.use(express.json());

// Настраиваем multer в память (Render Free дает 512 МБ RAM, 150 МБ под буфер - отлично)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 150 * 1024 * 1024 } 
});

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

app.post('/upload', upload.single('document'), async (req, res) => {
  console.log("\n=== [RENDER] ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ===");
  
  if (!req.file) {
    console.error("❌ Файл не найден в запросе!");
    return res.status(400).json({ error: 'Файл не найден в запросе фронтенда' });
  }

  console.log(`📂 Файл: "${req.file.originalname}" | Размер: ${(req.file.size / (1024 * 1024)).toFixed(2)} МБ`);

  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.error("❌ Ошибка: Переменные окружения TG_BOT_TOKEN или TG_CHAT_ID не заданы в панели Render!");
    return res.status(500).json({ error: 'Бэкенд не настроен в Переменных Окружения.' });
  }

  try {
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    
    const safeName = `${Date.now()}-${req.file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
    
    // Маскируем APK под octet-stream, чтобы убрать лишние проверки типов
    form.append('document', req.file.buffer, { 
      filename: safeName,
      contentType: 'application/octet-stream' 
    });

    console.log("🚀 Отправка fetch в Telegram API...");

    const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
      signal: AbortSignal.timeout(300000) // 5 минут таймаут
    });

    const resData = await response.json();

    if (!response.ok || !resData.ok) {
      console.error("❌ Telegram отклонил запрос:", JSON.stringify(resData));
      return res.status(500).json({ error: resData.description || 'Telegram Reject' });
    }

    console.log("🎉 Telegram успешно принял файл!");

    const fileId = resData.result.document.file_id;
    const pathResponse = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const pathData = await pathResponse.json();
    
    if (pathData.ok) {
      const filePath = pathData.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`;
      console.log(`🔗 Ссылка сгенерирована: ${downloadUrl}\n`);
      return res.json({ success: true, url: downloadUrl });
    }

    throw new Error('Не удалось получить путь файла от Telegram');
  } catch (error) {
    console.error('💥 Критический сбой:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Роут проверки работоспособности сервера
app.get('/', (req, res) => {
  res.send('IvPlay Бэкенд на Render Работает Идеально!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
});
