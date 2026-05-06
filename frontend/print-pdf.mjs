import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, '..', '技术路径页面.pdf');

(async () => {
    console.log('正在启动浏览器...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    // 设置较宽的视口，让页面渲染更完整
    await page.setViewport({ width: 1440, height: 900 });

    console.log('正在加载技术路径页面...');
    await page.goto('http://localhost:5173/about', {
        waitUntil: 'networkidle0',
        timeout: 30000,
    });

    // 等页面动画/渲染完毕
    await new Promise(r => setTimeout(r, 2000));

    console.log('正在生成 PDF...');
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,    // 保留背景色和渐变
        margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px',
        },
    });

    await browser.close();
    console.log(`✅ PDF 已保存到: ${outputPath}`);
})();
