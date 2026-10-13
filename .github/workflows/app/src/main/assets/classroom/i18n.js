// Teaching languages: BCP-47 code (used for both speech engines), English name, native name, RTL flag.
window.LANGS = [
  { code: 'en-IN', name: 'English', native: 'English' },
  { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ur-IN', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'bn-IN', name: 'Bengali', native: 'বাংলা' },
  { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'mr-IN', name: 'Marathi', native: 'मराठी' },
  { code: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu', native: 'తెలుగు' },
  { code: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'or-IN', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'as-IN', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'ne-NP', name: 'Nepali', native: 'नेपाली' },
  { code: 'sa-IN', name: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'ar-SA', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'fr-FR', name: 'French', native: 'Français' },
  { code: 'es-ES', name: 'Spanish', native: 'Español' },
  { code: 'de-DE', name: 'German', native: 'Deutsch' },
  { code: 'zh-CN', name: 'Chinese', native: '中文' },
  { code: 'ja-JP', name: 'Japanese', native: '日本語' }
];
window.langInfo = (code) => LANGS.find(l => l.code === code) || LANGS[0];

window.GRADES = ['Nursery / KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7',
  'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
window.SUBJECTS = ['English', 'Hindi', 'Mathematics', 'Science', 'EVS', 'Social Studies', 'Computer', 'General Knowledge',
  'Physics', 'Chemistry', 'Biology', 'Urdu', 'Sanskrit', 'Moral Science', 'Drawing & Art'];
