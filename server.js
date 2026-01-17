const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const ACCOUNTS_FILE = 'accounts.json';

// Загрузка аккаунтов из файла
let accounts = loadAccounts();

function loadAccounts() {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Ошибка загрузки аккаунтов:', error);
    }
    return [];
}

function saveAccounts() {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    } catch (error) {
        console.error('Ошибка сохранения аккаунтов:', error);
    }
}

// Маршрут статуса
app.get('/status', (req, res) => {
    res.json({ status: 'ok', accounts: accounts.length });
});

// Маршрут получения аккаунтов
app.get('/accounts', (req, res) => {
    res.json(accounts);
});

// Маршрут регистрации
app.post('/register', async (req, res) => {
    const { service, username, password } = req.body;
    
    console.log(`[REGISTER] ${service} для ${username}`);
    
    if (service === 'yahoo') {
        try {
            const result = await registerYahoo(username, password);
            
            if (result.success) {
                // Сохраняем аккаунт
                const account = {
                    service: 'yahoo',
                    email: result.email,
                    password: password,
                    created: new Date().toISOString(),
                    captcha: result.captcha || false
                };
                
                accounts.push(account);
                saveAccounts();
                
                res.json({
                    success: true,
                    email: result.email,
                    captcha: result.captcha || false
                });
            } else {
                res.json({
                    success: false,
                    error: result.error,
                    captcha: result.captcha || false
                });
            }
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            res.json({
                success: false,
                error: error.message
            });
        }
    } else {
        res.json({
            success: false,
            error: 'Сервис пока не поддерживается'
        });
    }
});

// Функция регистрации Yahoo
async function registerYahoo(username, password) {
    console.log('Запуск браузера для регистрации Yahoo...');
    
    const browser = await puppeteer.launch({
        headless: false, // Поставь true для скрытого режима
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // Маскируемся под обычный браузер
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Открываем страницу регистрации
        await page.goto('https://login.yahoo.com/account/create', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log('Страница загружена, заполняю форму...');
        
        // Заполняем форму с задержками (имитация человека)
        await page.waitForSelector('#usernamereg-firstName', { timeout: 10000 });
        
        // Имя
        await page.type('#usernamereg-firstName', 'John', { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Фамилия
        await page.type('#usernamereg-lastName', 'Doe', { delay: 100 });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Имя пользователя (email)
        await page.type('#usernamereg-userId', username, { delay: 150 });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Пароль
        await page.type('#usernamereg-password', password, { delay: 150 });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Дата рождения
        await page.select('#usernamereg-birthYear', '1990');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Проверяем на капчу
        const hasCaptcha = await page.evaluate(() => {
            return !!document.querySelector('iframe[src*="recaptcha"]') || 
                   !!document.querySelector('#recaptcha');
        });
        
        if (hasCaptcha) {
            console.log('Обнаружена капча!');
            await browser.close();
            return {
                success: false,
                error: 'Обнаружена капча reCAPTCHA',
                captcha: true
            };
        }
        
        // Нажимаем кнопку регистрации
        await page.click('#reg-submit-button');
        
        // Ждём результат
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Проверяем URL
        const currentUrl = page.url();
        console.log('Текущий URL:', currentUrl);
        
        if (currentUrl.includes('account/create/confirm')) {
            // Успешная регистрация
            const email = `${username}@yahoo.com`;
            console.log('✅ Регистрация успешна!');
            
            await browser.close();
            return {
                success: true,
                email: email,
                captcha: false
            };
        } else if (currentUrl.includes('challenge')) {
            // Какая-то проверка (капча или телефон)
            console.log('Требуется дополнительная проверка');
            
            // Делаем скриншот для отладки
            await page.screenshot({ path: 'debug.png' });
            
            await browser.close();
            return {
                success: false,
                error: 'Требуется дополнительная проверка (капча/телефон)',
                captcha: true
            };
        } else {
            // Неизвестная ошибка
            console.log('Неизвестный результат');
            await page.screenshot({ path: 'error.png' });
            
            // Пробуем извлечь сообщение об ошибке
            const errorText = await page.evaluate(() => {
                const errorEl = document.querySelector('.error-msg') || 
                               document.querySelector('.error') ||
                               document.querySelector('.errMsg');
                return errorEl ? errorEl.textContent : 'Неизвестная ошибка';
            });
            
            await browser.close();
            return {
                success: false,
                error: errorText || 'Неизвестная ошибка регистрации'
            };
        }
        
    } catch (error) {
        console.error('Ошибка в процессе регистрации:', error);
        
        if (browser) {
            await browser.close();
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Очистка аккаунтов
app.post('/clear', (req, res) => {
    accounts = [];
    saveAccounts();
    res.json({ success: true });
});

// Запуск сервера
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📊 Аккаунтов в базе: ${accounts.length}`);
    
    // Автоматически открываем браузер
    const { exec } = require('child_process');
    const url = `http://localhost:${PORT}`;
    
    switch (process.platform) {
        case 'darwin': // Mac
            exec(`open ${url}`);
            break;
        case 'win32': // Windows
            exec(`start ${url}`);
            break;
        case 'linux': // Linux
            exec(`xdg-open ${url}`);
            break;
    }
});
