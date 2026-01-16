const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin()); // Скрываем бота

const app = express();
app.use(express.json());
app.use(express.static('public'));

const ACCOUNTS_FILE = 'accounts.json';

// Загружаем аккаунты из файла
let accounts = [];
if (fs.existsSync(ACCOUNTS_FILE)) {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}

// 1. РЕГИСТРАЦИЯ YAHOO
app.post('/register', async (req, res) => {
    const { service, login, password } = req.body;
    
    console.log(`Регистрация ${service} для ${login}...`);
    
    if (service === 'yahoo') {
        const browser = await puppeteer.launch({
            headless: true, // Поставь false для отладки
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
            const page = await browser.newPage();
            
            // Устанавливаем User-Agent обычного браузера
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            // Идём на страницу регистрации
            await page.goto('https://login.yahoo.com/account/create', {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            
            // Заполняем форму с задержками (как человек)
            await page.type('#usernamereg-firstName', 'John', { delay: 100 });
            await page.waitForTimeout(1000);
            await page.type('#usernamereg-lastName', 'Doe', { delay: 100 });
            await page.waitForTimeout(1000);
            await page.type('#usernamereg-userId', login, { delay: 150 });
            await page.waitForTimeout(1000);
            await page.type('#usernamereg-password', password, { delay: 150 });
            await page.waitForTimeout(1000);
            
            // Выбираем дату рождения
            await page.select('#usernamereg-birthYear', '1990');
            await page.waitForTimeout(2000);
            
            // Проверяем наличие капчи
            const captchaFrame = await page.$('iframe[src*="recaptcha"]');
            
            if (captchaFrame) {
                await browser.close();
                return res.json({
                    success: false,
                    error: 'Обнаружена капча reCAPTCHA',
                    captcha: true
                });
            }
            
            // Нажимаем кнопку регистрации
            await page.click('#reg-submit-button');
            
            // Ждём перехода
            await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
            
            // Проверяем успешность
            const currentUrl = page.url();
            if (currentUrl.includes('account/create/confirm')) {
                const email = `${login}@yahoo.com`;
                
                // Сохраняем аккаунт
                accounts.push({
                    service: 'yahoo',
                    email: email,
                    password: password,
                    created: new Date().toISOString()
                });
                
                fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
                
                await browser.close();
                
                res.json({
                    success: true,
                    email: email,
                    message: 'Аккаунт создан'
                });
            } else {
                // Делаем скриншот для отладки
                await page.screenshot({ path: 'debug.png' });
                await browser.close();
                
                res.json({
                    success: false,
                    error: 'Неизвестная ошибка регистрации',
                    url: currentUrl
                });
            }
            
        } catch (error) {
            await browser.close();
            console.error('Ошибка:', error);
            res.json({
                success: false,
                error: error.message
            });
        }
    } else if (service === 'proton') {
        // Для Proton потребуется обход капчи и SMS
        res.json({
            success: false,
            error: 'Proton пока не поддерживается (требует SMS)'
        });
    }
});

// 2. ПРОВЕРКА ПОЧТЫ
app.get('/check-mail', async (req, res) => {
    // Здесь будет IMAP проверка
    // Пока заглушка
    res.json([
        { from: 'Yahoo <welcome@yahoo.com>', subject: 'Добро пожаловать' },
        { from: 'no-reply@protonmail.com', subject: 'Подтвердите email' }
    ]);
});

// 3. СПИСОК АККАУНТОВ
app.get('/accounts', (req, res) => {
    res.json(accounts);
});

// 4. ЗАПУСК СЕРВЕРА
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Аккаунтов в базе: ${accounts.length}`);
});
