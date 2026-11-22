# پکیج رسمی Node.js ویپانو

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

در GitHub Actions، Push روی `main` تست‌ها را اجرا می‌کند؛ **فقط Push تگ جدید** مانند `v1.0.1` انتشار جدید در npm را فعال می‌کند. برای انتشار امن نیاز به Trusted Publisher با فایل `publish.yml` و Environment با نام `npm` است. برای انتشار اول ممکن است ابتدا لازم باشد نسخه را از طریق حساب خودتان منتشر و سپس Trusted Publisher را فعال کنید.

محدودیت: تست‌های آفلاین جایگزین تست اتصال واقعی API نیستند و قالب دقیق پاسخ‌ها در کالکشن مستند نشده است.
