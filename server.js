const express = require('express');
const multer = require('multer');
const cors = require('cors');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 10000; 

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

// 1. ИСПРАВЛЕНО: Теперь Multer слушает поле 'file', как присылает фронтенд
app.post('/upload', upload.single('file'), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log("\n=== [RENDER] ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ===");
  
  if (!req.file) {
    console.error("❌ Файл не найден в запросе!");
    return res.status(400).json({ error: 'Файл не найден в запросе фронтенда' });
  }

  console.log(`📂 Файл: "${req.file.originalname}" | Размер: ${(req.file.size / (1024 * 1024)).toFixed(2)} МБ`);

  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.error("❌ Ошибка: Переменные окружения не заданы!");
    return res.status(500).json({ error: 'Бэкенд не настроен в Переменных Окружения.' });
  }

  try {
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    
    const safeName = `${Date.now()}-${req.file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
    
    // Для Телеграма оставляем ключ 'document'
    form.append('document', req.file.buffer, { 
      filename: safeName,
      contentType: 'application/octet-stream' 
    });

    console.log("🚀 Отправка файла в Telegram API...");

    const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
      signal: AbortSignal.timeout(300000)
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
      
      // 2. ИСПРАВЛЕНО: Ссылка теперь ведёт на твой сервер Render, скрывая токен бота!
      const downloadUrl = `https://${req.get('host')}/file/${filePath}`;
      console.log(`🔗 Безопасная ссылка сгенерирована: ${downloadUrl}\n`);
      return res.json({ success: true, url: downloadUrl });
    }

    throw new Error('Не удалось получить путь файла от Telegram');
  } catch (error) {
    console.error('💥 Критический сбой внутри /upload:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. ДОБАВЛЕНО: Безопасный прокси-роут для отдачи изображений и файлов
app.get('/file/*', async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const filePath = req.params[0]; // Получаем путь вроде 'documents/file_0.jpg'
    
    if (!TG_BOT_TOKEN) return res.status(500).send("Токен бота отсутствует");

    const response = await fetch(`https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`);
    
    if (!response.ok) return res.status(response.status).send("Файл не найден в Telegram");

    // Пересылаем правильный тип контента (image/png, image/jpeg и т.д.)
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
  console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
});
