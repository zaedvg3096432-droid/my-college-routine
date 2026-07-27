# روتيني الجامعي — الحصول على ملف APK مجانًا (بدون تثبيت أي برنامج)

هذا المشروع يحتوي على GitHub Actions جاهز (`.github/workflows/build-apk.yml`) يبني ملف APK
تلقائيًا على سيرفرات GitHub المجانية بمجرد رفع هذه الملفات — بدون تثبيت Android Studio.

الخطوات الكاملة موجودة بالتفصيل في رسالة Claude، وملخصها:

1. أنشئ حساب GitHub مجاني: https://github.com/signup
2. أنشئ مستودع (Repository) جديد فارغ
3. ثبّت GitHub Desktop (مجاني): https://desktop.github.com
4. اربط GitHub Desktop بالمستودع، وانسخ كل محتويات هذا المجلد بداخله
5. اعمل Commit ثم Push
6. من صفحة المستودع على github.com ← تبويب **Actions** ← انتظر علامة ✅ خضراء (2-5 دقائق)
7. من داخل الـ run المكتمل ← قسم **Artifacts** أسفل الصفحة ← نزّل `app-debug-apk`
8. فك الضغط عن الملف الصغير الناتج → هتلاقي `app-debug.apk`
9. انقله لهاتفك وثبّته (اسمح بـ"تثبيت من مصدر غير معروف" لو طلب منك)

## بديل: البناء محليًا عبر Android Studio

لو تفضّل تبني الملف على جهازك مباشرة بدل الرفع لـ GitHub، افتح مجلد `android` في Android Studio
(مجاني: https://developer.android.com/studio) ثم:
**Build ← Build Bundle(s) / APK(s) ← Build APK(s)**

الملف الناتج هيكون في: `android/app/build/outputs/apk/debug/app-debug.apk`

## عن الإشعارات

بعد التثبيت، افتح تبويب "العادات" ووافق على تفعيل التذكيرات. من هذه اللحظة، أي عادة تحدد لها
وقت تذكير هتوصلك عليها تنبيه حقيقي من نظام أندرويد نفسه، حتى لو التطبيق مغلق تمامًا.
