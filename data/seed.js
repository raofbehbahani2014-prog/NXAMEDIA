// این اسکریپت فقط یک‌بار برای ساخت db.json اجرا می‌شود
const fs = require('fs');
const path = require('path');

const { services } = require('./services');
const { portfolio } = require('./portfolio');
const { courses } = require('./courses');
const { articles } = require('./articles');
const { faqs } = require('./faqs');
const { testimonials } = require('./testimonials');
const { team } = require('./team');
const { pricing } = require('./pricing');

const db = {
  site: {
    siteName: 'NxMedia',
    logoText1: 'Nx',
    logoText2: 'Media',
    navLabels: {
      home: 'خانه',
      services: 'خدمات',
      portfolio: 'نمونه‌کارها',
      education: 'آموزش',
      courses: 'دوره‌ها',
      about: 'درباره ما',
      blog: 'وبلاگ',
      contact: 'تماس با ما'
    },
    buttons: {
      consultation: 'رزرو مشاوره',
      requestProject: 'درخواست پروژه',
      clientLogin: 'ورود مشتری',
      clientPanel: 'پنل مشتری'
    },
    hero: {
      title1: 'تولید محتوا و مدیریت',
      titleHighlight: 'اینستاگرام',
      title2: 'با نتیجه واقعی',
      subtitle: 'از سناریونویسی تا فیلم‌برداری، تدوین و مدیریت کامل پیج — NxMedia همراه شما برای رشد واقعی کسب‌وکارتان در اینستاگرام است.',
      stat1Value: '+۱۲۰', stat1Label: 'پروژه موفق',
      stat2Value: '+۸۰', stat2Label: 'برند فعال',
      stat3Value: '۴.۹/۵', stat3Label: 'رضایت مشتریان',
      videoUrl: ''
    },
    about: {
      title: 'داستان ما از کجا شروع شد',
      text1: 'NxMedia با هدف کمک به کسب‌وکارهای کوچک و بزرگ برای حضور حرفه‌ای در اینستاگرام تاسیس شد. ما معتقدیم محتوای خوب باید هم زیبا باشد و هم نتیجه‌محور. به همین دلیل هر پروژه را با استراتژی، داده و خلاقیت همراه می‌کنیم تا رشد پیج شما پایدار و واقعی باشد.',
      text2: 'تیم ما ترکیبی از تخصص‌های سناریونویسی، فیلم‌برداری، تدوین، طراحی گرافیک و بازاریابی محتواست که در کنار هم، تجربه‌ای یکپارچه برای برند شما می‌سازند.',
      stat1Value: '+۴', stat1Label: 'سال سابقه فعالیت',
      stat2Value: '+۱۲۰', stat2Label: 'پروژه موفق',
      stat3Value: '+۸۰', stat3Label: 'برند فعال',
      stat4Value: '۱۵', stat4Label: 'عضو تیم تخصصی'
    },
    contact: {
      phone: '021-00000000',
      whatsapp: '09120000000',
      email: 'info@nxmedia.ir',
      instagramUrl: '#',
      whatsappUrl: '#',
      telegramUrl: '#'
    },
    footer: {
      about: 'آژانس تولید محتوا و آموزش تخصصی اینستاگرام. رشد پیج شما، ماموریت ماست.',
      newsletterTitle: 'عضویت در خبرنامه',
      newsletterText: 'جدیدترین آموزش‌ها و ترندهای اینستاگرام را در ایمیل خود دریافت کنید.',
      copyrightText: 'تمامی حقوق محفوظ است.'
    },
    ctaBand: {
      title: 'آماده شروع رشد واقعی پیج‌تان هستید؟',
      subtitle: 'همین امروز درخواست پروژه ثبت کنید یا یک مشاوره رایگان رزرو کنید.'
    }
  },
  services,
  portfolio,
  courses,
  articles,
  faqs,
  testimonials,
  team,
  pricing,
  media: [],
  leads: {
    contact: [],
    projectRequests: [],
    consultations: []
  }
};

fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2), 'utf-8');
console.log('✅ db.json ساخته شد.');
