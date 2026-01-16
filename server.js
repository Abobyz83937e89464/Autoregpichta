const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();
app.use(express.json());

let accounts = [];

// 1. РЕГИСТРАЦИЯ
app.post('/register', async (req, res) => {
    const { service, login, password } = req.body;
    
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        if (service === 'yahoo') {
            await page.goto('https://login.yahoo.com/account/create');
            
            // Заполняем форму
            await page.type('#usernamereg-firstName', 'Test');
            await page.type('#usernamereg-lastName', 'User');
            await page.type('#usernamereg-userId', login);
            await page.type('#usernamereg-password', password);
            
            // Ждём капчу (если появится)
            await page.waitForTimeout(5000);
            
            // Проверяем, есть ли капча
            const captcha = await page.$('#recaptcha');
            if (captcha) {
                await browser.close();
                return res.json({ 
                    success: false, 
                    error: 'Обнаружена капча', 
                    captcha: true 
                });
            }
            
            // Нажимаем кнопку
            await page.click('#reg-submit-button');
            await page.waitForTimeout(3000);
            
            // Сохраняем аккаунт
            const email = `${login}@yahoo.com`;
            accounts.push({ service, email, password });
            fs.appendFileSync('accounts.txt', `${email}|${password}\n`);
            
            await browser.close();
            res.json({ success: true, email });
            
        } else if (service === 'proton') {
            // Аналогично для Proton
            await page.goto('https://account.proton.me/signup');
            // ... логика регистрации Proton
            // (требует обхода капчи и подтверждения телефона)
        }
    } catch (error) {
        await browser.close();
        res.json({ success: false, error: error.message });
    }
});

// 2. ПРОВЕРКА ПОЧТЫ (IMAP)
app.get('/check-mail', async (req, res) => {
    // Здесь код подключения к IMAP (для Yahoo)
    // или парсинг Proton через API
    res.json([
        { from: 'service@yahoo.com', subject: 'Добро пожаловать' },
        { from: 'no-reply@proton.com', subject: 'Подтвердите email' }
    ]);
});

// 3. СПИСОК АККАУНТОВ
app.get('/accounts', (req, res) => {
    res.json(accounts);
});

// 4. Раздача HTML
app.use(express.static('public'));

app.listen(3000, () => console.log('Сервер запущен на http://localhost:3000'));
