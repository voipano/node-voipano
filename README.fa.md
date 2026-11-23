# پکیج رسمی Node.js ویپانو

[![Tests](https://github.com/voipano/node-voipano/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/voipano/node-voipano/actions/workflows/tests.yml)
[![npm version](https://img.shields.io/npm/v/voipano)](https://www.npmjs.com/package/voipano)
[![License](https://img.shields.io/github/license/voipano/node-voipano)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-EN%20%7C%20FA-blue)](README.fa.md)

SDK رسمی و مستقل از وابستگی‌های Runtime برای **Node.js 22+** با پشتیبانی از JavaScript، TypeScript، ESM و CommonJS.

**فقط برای بک‌اند:** توکن API را هرگز داخل مرورگر، کد Frontend یا اپ موبایل قرار ندهید.

## نصب

```bash
npm install voipano
```

## استفاده

```js
import { VoipanoClient } from 'voipano';

const client = new VoipanoClient({ token: process.env.VOIPANO_API_TOKEN });
const services = await client.services.all();
const contacts = await client.contacts.all({ page: 1, per_page: 20 });
```

انتخاب سرویس بدون تغییر تنظیمات قبلی:

```js
const scoped = client.forService('your-service-id');
```

تماس واقعی (بدون Retry خودکار):

```js
await client.calls.clickToCall('09120000000', '09121111111', { timeout: 30 });
await client.calls.otp('09120000000', { purpose: 'login' });
```

دریافت فایل صوتی بدون بازنویسی فایل موجود:

```js
await client.recordings.downloadCall('cdr-id', 'call-details-id', './call.wav');
```

تمام **۲۳ درخواست** کالکشن Postman پوشش داده شده‌اند: سرویس‌ها، مخاطبین، گروه‌ها، گزارش‌ها، صوت انتظار، صندوق صوتی، دانلود ضبط، مدیریت وبهوک، OTP، تماس سریع و تماس امن.

وبهوک ورودی تا زمان مشخص‌شدن روش امضا و مقابله با Replay **به‌صورت پیش‌فرض رد می‌شود**.

## تست و انتشار

```bash
npm ci
npm test
npm pack --dry-run
```

در GitHub Actions، تست‌ها روی شاخه اصلی اجرا می‌شوند. گردش‌کار انتشار هنگام Push به main یا اجرای دستی فعال می‌شود و با semantic-release بر اساس پیام کامیت‌ها تصمیم می‌گیرد که نسخه جدید منتشر شود یا خیر. انتشار نسخه‌های جدید از طریق Trusted Publishing انجام می‌شود.

پکیج قبلاً در npm منتشر شده است. تگ انتشار را دستی ایجاد یا جابه‌جا نکنید و نسخه منتشرشده را دوباره منتشر نکنید. جزئیات در [تنظیمات انتشار](release.config.mjs) آمده است.

محدودیت: تست‌های آفلاین جایگزین تست اتصال واقعی API نیستند و قالب دقیق پاسخ‌ها در کالکشن مستند نشده است.
