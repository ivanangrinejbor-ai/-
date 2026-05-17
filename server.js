const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const https = require('https'); // Добавляем системный модуль сети

const app = express();
const PORT = process.env.PORT || 7860; 

// Включаем CORS, чтобы твой сайт мог без проблем слать запросы
app.use(cors({ origin: '*' }));
app.use(express.json());

// Настраиваем multer для сборки файлов в оперативной памяти (до 250 МБ)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 250 * 1024 * 1024 } 
});

// Переменные окружения из настроек Hugging Face (Settings)
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// КРИТИЧЕСКИЙ ФИКС СЕТИ ДЛЯ HUGGING FACE
// Заставляем удерживать сокет открытым и использовать IPv4, чтобы HF не обрывал TLS-соединение
const httpsAgent = new https.Agent({
  keepAlive: true,
  family: 4 // Строго IPv4 (на бесплатном HF IPv6 часто вызывает сброс сокета)
});

app.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не найден в запросе' });
    }

    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
      return res.status(500).json({ error: 'Бэкенд не настроен: отсутствуют токены в Settings.' });
    }

    // Собираем FormData для отправки в Telegram API
    const form = new FormData();
    form.append('chat_id', TG_CHAT_ID);
    
    // Очищаем имя файла и добавляем timestamp
    const safeName = `${Date.now()}-${req.file.originalname.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
    
    // Передаем файл как бинарный буфер, принудительно указывая размер (knownLength)
    // Это нужно, чтобы поток данных не зависал в сети
    form.append('document', req.file.buffer, { 
      filename: safeName,
      contentType: req.file.mimetype || 'application/octet-stream',
      knownLength: req.file.size
    });

    // Явно вычисляем длину контента всей формы
    const headers = {
      ...form.getHeaders(),
      'Content-Length': form.getLengthSync()
    };

    let tgResponse;
    try {
      // 1. Отправляем файл в Telegram с кастомным HTTPS-агентом и отключенным таймаутом
      tgResponse = await axios.post(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`, form, {
        headers: headers,
        httpsAgent: httpsAgent, // Применяем сетевой фикс
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 0 // Отключаем ограничения по времени для тяжелых файлов
      });
    } catch (apiError) {
      // Перехватываем точную ошибку, если Телеграм отклонит запрос
      const responseError = apiError.response ? apiError.response.data : null;
      console.error('Телеграм отклонил файл:', responseError || apiError.message);
      return res.status(500).json({ 
        error: responseError && responseError.description ? `Telegram: ${responseError.description}` : apiError.message 
      });
    }

    if (tgResponse.data && tgResponse.data.ok) {
      const fileId = tgResponse.data.result.document.file_id;

      // 2. Запрашиваем путь к файлу через тот же агент безопасности
      const pathResponse = await axios.get(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${fileId}`, {
        httpsAgent: httpsAgent
      });
      
      if (pathResponse.data && pathResponse.data.ok) {
        const filePath = pathResponse.data.result.file_path;
        // Публичная ссылка, которую получит фронтенд
        const downloadUrl = `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`;
        
        return res.json({ success: true, url: downloadUrl });
      }
    }

    throw new Error('Telegram API ответил неудачно');
  } catch (error) {
    console.error('Ошибка загрузки на бэкенде:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('IvPlay Безопасный Прокси Бэкенд Работает!');
});

app.listen(PORT, () => {
  console.log(`Сервер успешно запущен на порту ${PORT}`);
});