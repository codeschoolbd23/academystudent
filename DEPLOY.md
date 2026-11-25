# অনলাইনে দেওয়ার নিয়ম

## সমস্যা কেন হয়েছিল
GitHub Pages শুধু স্ট্যাটিক ফাইল (HTML/CSS/JS) দেখাতে পারে। লগইন, কুইজ সেভ ও ফলাফলের জন্য `server.js` চালু থাকতে হয়,
যা GitHub Pages-এ চলে না। তাই `/api/login` এ "405 Method Not Allowed" আসছিল।

## পদ্ধতি ক: সব এক জায়গায় (সহজ, প্রস্তাবিত)
`server.js` নিজেই ওয়েবসাইট ও API দুটোই দেয়। তাই Node.js চলে এমন হোস্টে পুরো ফোল্ডার দিন (যেমন Render)।

1. GitHub রিপোজিটরির মূল ফোল্ডারে এই ফাইলগুলো রাখুন:
   `server.js package.json index.html style.css app.js config.js` (`portal.db` বা `data.json` তুলবেন না)।
2. render.com → New → Web Service → রিপোজিটরি বেছে নিন।
3. Runtime: Node · Build Command: ফাঁকা (বা `npm install`) · Start Command: `node server.js`
4. Environment Variables:
   - `ADMIN_PASSWORD` = আপনার শক্ত পাসওয়ার্ড (অবশ্যই দিন, নইলে অ্যাডমিন পাসওয়ার্ড admin123 থাকবে)
   - `NODE_VERSION` = 22 (Node 22.13+ লাগবে)
5. Deploy শেষ হলে Render-এর দেওয়া ঠিকানা খুলুন।

## পদ্ধতি খ: ফ্রন্টএন্ড GitHub Pages-এ, ব্যাকএন্ড আলাদা
1. ব্যাকএন্ড উপরের মতো Render-এ দিন, সাথে এই Environment Variable যোগ করুন:
   `ALLOWED_ORIGIN` = `https://codeschoolbd23.github.io` (শেষে `/` বা রিপোজিটরির নাম ছাড়া)
2. `config.js` ফাইলে লিখুন: `window.API_BASE='https://আপনার-অ্যাপ.onrender.com';`
3. GitHub Pages-এ `index.html style.css app.js config.js` আপলোড করুন।

## ডেটা হারানোর ঝুঁকি (গুরুত্বপূর্ণ)
ডেটা `portal.db` ফাইলে থাকে। অনেক ফ্রি হোস্টে ফাইল সিস্টেম অস্থায়ী, রিস্টার্ট বা নতুন ডেপ্লয়ে সব মুছে যায়।
স্থায়ী রাখতে চাইলে হোস্টের স্থায়ী ডিস্ক (Persistent Disk / Volume) নিন, তার পথে ডেটাবেস রাখুন:
`DB_FILE=/var/data/portal.db` (ডিস্ক মাউন্ট যেখানে করবেন সেই পথ)।
Render-এ ডিস্ক সাধারণত পেইড প্ল্যানে মেলে, Fly.io-তে ভলিউম আছে। দাম ও শর্ত নিজে দেখে নিন।
দীর্ঘমেয়াদী ব্যবহারের জন্য হোস্টেড ডেটাবেসে (যেমন PostgreSQL) যাওয়া ভালো।

## নিরাপত্তা
- `ADMIN_PASSWORD` সেট করুন এবং প্রোফাইল পেজ থেকে পরে পাসওয়ার্ড বদলান।
- অনলাইনে HTTPS ব্যবহার করুন (Render নিজে দেয়)।
- একই আইপি থেকে ১০বার ভুল পাসওয়ার্ড দিলে ১০ মিনিট লগইন আটকে যায়।

## নাম ও রং বদলানো
সাইটের নাম, ট্যাগলাইন, লোগোর অক্ষর ও মূল রং `config.js` ফাইলের `window.SITE` অংশে বদলান। হেডার, ফুটার, লগইন পেজ ও ব্রাউজার ট্যাবে একসাথে বদলে যাবে। অন্য ফাইল ছুঁতে হবে না।
