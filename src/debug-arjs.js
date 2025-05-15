// Файл для отладки проблем с AR.js

// Функция для проверки состояния AR.js
function checkARJSStatus() {
  //console.log('=== AR.js Status Check ===');
  
  // Проверяем, загружен ли A-Frame
  if (window.AFRAME) {
   // console.log('✅ A-Frame загружен, версия:', window.AFRAME.version);
    
    // Проверяем наличие систем AR.js
    if (window.AFRAME.systems) {
      //console.log('✅ A-Frame systems доступны');
      
      // Проверяем наличие системы arjs
      if (window.AFRAME.systems.arjs) {
        //console.log('✅ AR.js система найдена');
        
        // Проверяем AR.js объекты и методы
        if (window.ARjs) {
          //console.log('✅ Глобальный объект ARjs доступен');
          
          // Проверка основных классов AR.js
          const classesToCheck = ['Context', 'Session', 'Utils', 'Marker'];
          classesToCheck.forEach(className => {
            if (window.ARjs[className]) {
              //console.log(`✅ ARjs.${className} доступен`);
            } else {
             //console.log(`❌ ARjs.${className} отсутствует`);
            }
          });
          
        } else {
          //console.log('❌ Глобальный объект ARjs не найден');
        }
        
      } else {
       // console.log('❌ AR.js система не найдена в AFRAME.systems');
       // console.log('📋 Доступные системы:', Object.keys(window.AFRAME.systems));
      }
    } else {
     // console.log('❌ A-Frame systems недоступны');
    }
  } else {
    //console.log('❌ A-Frame не загружен');
  }
  
  //console.log('=== End of Status Check ===');
}

// Запускаем проверку после полной загрузки страницы
document.addEventListener('DOMContentLoaded', function() {
  //console.log('DOM загружен, ожидаем полной загрузки страницы...');
  
  // Первая проверка сразу после загрузки DOM
  setTimeout(checkARJSStatus, 1000);
  
  // Вторая проверка через 3 секунды
  setTimeout(checkARJSStatus, 3000);
});

// Запускаем проверку после полной загрузки всех ресурсов
window.addEventListener('load', function() {
  //console.log('Страница полностью загружена');
  
  // Третья проверка после полной загрузки
  setTimeout(checkARJSStatus, 500);
  
  // Четвертая проверка через 2 секунды после полной загрузки
  setTimeout(checkARJSStatus, 2000);
});

// Функция для мониторинга и перехвата ошибок AR.js
function monitorARJSErrors() {
  // Оригинальная функция console.assert
  const originalAssert = console.assert;
  
  // Переопределяем console.assert для перехвата ошибок AR.js
  console.assert = function() {
    // Записываем аргументы для отладки
    //console.log('console.assert вызван с аргументами:', Array.from(arguments));
    
    // Если первый аргумент false (условие не выполнено)
    if (!arguments[0]) {
      //console.warn('Перехвачен console.assert с ошибкой:', Array.from(arguments).slice(1).join(' '));
      
      // Проверяем стек вызовов, чтобы определить, откуда пришла ошибка
      const stack = new Error().stack;
      //console.log('Стек вызовов:', stack);
      
      // Если это ошибка из AR.js, пытаемся восстановиться
      if (stack.includes('ARjs')) {
        //console.warn('Ошибка связана с AR.js, пытаемся восстановиться...');
        
        // Возвращаем true вместо падения
        return true;
      }
    }
    
    // Иначе вызываем оригинальную функцию
    return originalAssert.apply(console, arguments);
  };
  
 // console.log('Монитор ошибок AR.js активирован');
}

// Запускаем мониторинг ошибок
window.addEventListener('DOMContentLoaded', monitorARJSErrors);

// Экспортируем функцию для использования в других файлах
export { checkARJSStatus, monitorARJSErrors }; 