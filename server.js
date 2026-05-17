// ========================================================
// URL ТВОЕГО БЭКЕНДА НА RENDER
// ========================================================
const BACKEND_URL = "https://1-b1n9.onrender.com";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Вспомогательная функция для отправки ЛЮБОГО файла (хоть APK, хоть скриншот) на твой бэкенд
 */
function sendFileToBackend(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    // Передаем файл. Наш сервер с upload.any() примет его с любым ключом
    formData.append("document", file); 

    const xhr = new XMLHttpRequest();
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resData = JSON.parse(xhr.responseText);
          if (resData.success && resData.url) {
            resolve(resData.url); // Возвращает прокси-ссылку вида https://1-b1n9.onrender.com/file/...
          } else {
            reject(new Error(resData.error || "Бэкенд не вернул ссылку"));
          }
        } catch (e) {
          reject(new Error("Ошибка парсинга ответа сервера"));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.error || `Ошибка сервера: ${xhr.status}`));
        } catch(e) {
          reject(new Error(`Бэкенд ответил ошибкой: ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Сетевая ошибка при связи с сервером"));
    
    xhr.open("POST", `${BACKEND_URL}/upload`);
    xhr.send(formData);
  });
}

/**
 * Главная функция сборки и загрузки всех ресурсов проекта
 */
export async function uploadProjectAssets({ projectId, apkFile, newtrobatFile, screenshots, onProgress }) {
  const uploads = [];
  const screenshotFiles = Array.from(screenshots || []).slice(0, 8);

  // 1. Считаем общее количество файлов для прогресс-бара
  let totalFiles = 0;
  if (apkFile) totalFiles++;
  if (newtrobatFile) totalFiles++;
  totalFiles += screenshotFiles.length;

  let completedFiles = 0;

  // Функция для обновления прогресса на фронтенде
  const tickProgress = (fileName) => {
    completedFiles++;
    const percent = Math.round((completedFiles / totalFiles) * 100);
    onProgress?.(percent, fileName);
  };

  // 2. Загружаем APK (если есть)
  let apkUrl = null;
  if (apkFile) {
    onProgress?.(Math.round((completedFiles / totalFiles) * 100), `Загрузка ${apkFile.name}...`);
    apkUrl = await sendFileToBackend(apkFile);
    tickProgress(apkFile.name);
  }

  // 3. Загружаем .newtrobat файл (если есть)
  let newtrobatUrl = null;
  if (newtrobatFile) {
    onProgress?.(Math.round((completedFiles / totalFiles) * 100), `Загрузка ${newtrobatFile.name}...`);
    newtrobatUrl = await sendFileToBackend(newtrobatFile);
    tickProgress(newtrobatFile.name);
  }

  // 4. ИСПРАВЛЕНО: Загружаем скриншоты на твой бэкенд вместо Firebase!
  const screenshotUrls = [];
  for (const imgFile of screenshotFiles) {
    if (!IMAGE_TYPES.includes(imgFile.type)) {
      console.warn(`Пропущен неподдерживаемый файл: ${imgFile.name}`);
      continue;
    }
    onProgress?.(Math.round((completedFiles / totalFiles) * 100), `Загрузка скриншота ${imgFile.name}...`);
    
    // Шлём картинку на тот же роут /upload
    const imgUrl = await sendFileToBackend(imgFile);
    screenshotUrls.push(imgUrl);
    
    tickProgress(imgFile.name);
  }

  // Возвращаем объект со всеми ссылками обратно в app.js для сохранения в базу данных
  return {
    apkUrl,
    newtrobatUrl,
    screenshots: screenshotUrls
  };
}

/**
 * Загрузка аватарки (Переводим тоже на бэкенд, чтобы полностью избавиться от Firebase Storage)
 */
export async function uploadAvatarFile(file, onProgress) {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new Error("Допускаются только изображения PNG, JPG и WebP.");
  }
  onProgress?.(10, "Загрузка аватарки...");
  const url = await sendFileToBackend(file);
  onProgress?.(100, "Готово");
  return { url };
}
