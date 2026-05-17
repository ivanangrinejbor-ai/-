const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data'); // Используем библиотеку, она умеет работать со стримами диска

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

// ИСПРАВЛЕНО: Сохраняем файлы на ДИСК во временную папку /tmp, чтобы не забивать оперативку
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = '/tmp/uploads';
    if (!fs.existsSync(tmpDir)){
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
    cb(null, safeName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 150 * 1024 * 1024 } 
});

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// РОУТ ЗАГРУЗКИ ФАЙЛОВ
app.post('/upload', upload.any(), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log("\n=== [RENDER] ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ===");
  
  const file = req.files && req.files[0];
  if (!file) {
    console.error("❌ Файл не найден в запросе!");
    return res.status(400).json({ error: 'Файл не найден' });
  }

  console.log(`📂 Файл: "${file.originalname}" | Размер: ${(file.size / (1024 * 1024)).toFixed(2)} МБ`);
  console.log(`💾 Сохранен на диск: ${file.path}`);

  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.error("❌ Ошибка: Переменные окружения не заданы!");
    // Удаляем файл с диска, чтобы не копить мусор при ошибке
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: 'Бэкенд не настроен в Переменных Окружения.' });
  }

  try {
    console.log("🚀 Стрим-отправка файла в Telegram API...");

    // Создаем FormData из библиотеки form-data, так как она идеально стримит файлы с диска
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    
    // ИСПРАВЛЕНО: Вместо буфера передаем СТРИМ файла. Оперативка = 0 МБ!
    form.append('document', fs.createReadStream(file.path), {
      filename: file.filename,
      contentType: 'application/octet-stream'
    });

    const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: form.getHeaders(), // Передаем заголовки стрима
      body: form
    });

    const resData = await response.json();

    // Удаляем временный файл с диска СРАЗУ после ответа Телеграма, чтобы освободить место
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    if (!response.ok || !resData.ok) {
      console.error("❌ Telegram отклонил запрос:", JSON.stringify(resData));
      return res.status(500).json({ error: resData.description || 'Telegram Reject' });
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
      throw new Error('Telegram не вернул file_id');
    }

    const pathResponse = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fileId}`);
    const pathData = await pathResponse.json();
    
    if (pathData.ok) {
      const filePath = pathData.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`;
      console.log(`🔗 Ссылка сгенерирована: ${downloadUrl}\n`);
      return res.json({ success: true, url: downloadUrl });
    }

    throw new Error('Не удалось получить путь файла от Telegram через getFile');
  } catch (error) {
    console.error('💥 Критический сбой внутри /upload:', error.message);
    // На всякий случай подчищаем файл при падении
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(500).json({ error: error.message });
  }
});

// Безопасный прокси-роут
app.get('/file/*', async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const filePath = req.params[0]; 
    if (!TG_BOT_TOKEN) return res.status(500).send("Токен бота отсутствует");

    const response = await fetch(`https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`);
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
  res.send('IvPlay Бэкенд работает стабильно на диске!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
});
