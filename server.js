const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = 3000;

// Настройка CORS
app.use(cors());

// Создаем папку для сохранения фото, если её нет
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Настройка multer для сохранения файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `photo_${Date.now()}.jpg`);
  }
});

const upload = multer({ storage: storage });

// Роут для сохранения фото
app.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не был загружен' });
  }
  res.json({ 
    success: true, 
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`
  });
});

// Роут для получения списка фото
app.get('/photos', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при чтении директории' });
    }
    res.json(files);
  });
});

// Раздача статических файлов
app.use('/uploads', express.static(uploadDir));

// Раздача статических файлов Vue приложения
app.use(express.static(path.join(__dirname, 'dist')));

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
}); 