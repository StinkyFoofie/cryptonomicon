/* ==========================================================================
   LAYER 1: CONFIGURATION BLOCK (config.js)
   ========================================================================== */
window.CONFIG = {
  // 1. App Identity & Core Metadata
  APP_ARCHITECTURE: "Single-File Offline PWA",
  APP_NAME: "NOMICON",
  APP_SHORT_NAME: "NOMICON",
  APP_VERSION: "0.66",

  // 2. API Credentials & Cloud Paths
  RAWG_API_KEY: "db9f18921e714a36bb784e65b5fd424b",
  DB_COLLECTION: "nomicon",
  FIREBASE: {
    apiKey: "AIzaSyCk9HvlsACbj-XsH8hAS0rqXSXPYbBN7vk",
    authDomain: "video-game-cryptonomicon.firebaseapp.com",
    projectId: "video-game-cryptonomicon",
    storageBucket: "video-game-cryptonomicon.firebasestorage.app",
    messagingSenderId: "63649233927",
    appId: "1:63649233927:web:c2717ba5797c3cf4243ea2"
  },

  // 3. Companion Brand Assets (Keep image files flat in the same directory as index.html!)
  ASSETS: {
    FAVICON_DESKTOP: "Favicon_Desktop_1024_v1.png",
    FAVICON_MOBILE: "Favicon_iPhone_1024_v1.png",
    LOGO_BRAND: "Logo_v1.png"
  },

  // 4. App Defaults
  DEFAULT_THEME: "random",
  DEFAULT_CURRENCY: "USD",

  // 5. UI Identity & Prominent Strings (Strict Alphabetical Order)
  BTN_ADD_GAME: "➕ Add Game",
  BTN_AUDIT_CACHE: "🔄 Check Local Cache",
  BTN_CHECK_RAWG: "🌐 RAWG Check",
  BTN_CLEAR_CACHE: "🗑️ Clear Cache",
  BTN_CLEAR_FILTERS: "🧹 Clear Filters",
  BTN_FORCE_SYNC: "🚀 Sync",
  BTN_RANDOM_GAME: "🎲",
  BTN_SETTINGS: "⚙️ Settings",
  BTN_STATS: "📊",
  BTN_THEME: "🎨 Theme",
  BTN_THEME_RANDOM: "🎲 Surprise Me!",
  BTN_WINNER_CONFIRM: "Awesome!",
  EMPTY_SEARCH_TEXT: "YOU DON'T OWN THIS GAME! 🤣🤣🤣🤣🤣🤣🤣",
  EMPTY_STATE_TEXT: "LIBRARY IS EMPTY! 😭😭😭😭😭😭😭",
  RATING_LABEL: "Your Rating",
  SETTINGS_TITLE: "Settings",
  WINNER_BANNER_TEXT: "🎉 Winner! 🎉",

  // 6. Centralized Notification & Error Messages
  MESSAGES: {
    ACHIEVEMENT_ERROR: "⚠ Earned achievements cannot exceed total! Please check your numbers.",
    ACHIEVEMENT_NEGATIVE: "⚠️ Achievement values cannot be negative numbers!",
    CACHE_AUDITED: "Local cache verified and up to date! 💾",
    CACHE_CLEARED: "Local cache cleared.",
    CACHE_CONFIRM: "Clear local cache? (Unsynced cloud data will be lost!)",
    CONFIRM_DELETE: "Are you sure you want to permanently delete this game? This action cannot be undone.",
    DATE_FUTURE_ERROR: "⚠️ Entered date cannot be in the future! Please enter a valid date.",
    DATE_INVALID_ERROR: "⚠️ Invalid calendar date entered! Please check your date.",
    DELETED_TOAST: "DELETED - {title}",
    EMPTY_RANDOMIZER: "No games found in your library to roll!",
    NUMERIC_NEGATIVE: "⚠️ Playtime and HLTB values cannot be negative!",
    PLATFORM_REQUIRED: "⚠️ Platform is required!",
    RAWG_OFFLINE: "⚠ RAWG API: Connection Error",
    RAWG_ONLINE: "⚠️ RAWG API: Online & Connected",
    RAWG_REFRESH_ERROR: "⚠️ RAWG: No metadata found or connection failed!",
    RAWG_REFRESH_SUCCESS: "RAWG metadata refreshed! 🔄",
    SAVED_TOAST: "SAVED - {title}",
    SYNC_SUCCESS: "Library Synced! 🚀",
    TITLE_REQUIRED: "⚠️ Title is required!"
  },

  // 7. Configurable Blank Field Placeholders (Strict Alphabetical Order)
  PLACEHOLDERS: {
    DATE_ADDED: "Select Title...",
    DATE_COMPLETED: "Select Beat or Completed Status...",
    DESCRIPTION: "Select Title...",
    DEVELOPER: "Select Title...",
    EDITION: "Select Edition...",
    FORMAT: "Select Format...",
    GENRES: "Select Title...",
    HLTB_WARNING_TEXT: "⚠️ Select Title First",
    NOT_RELEASED_LABEL: "🚀 Not yet released!",
    PLATFORM: "Select Platform...",
    PUBLISHER: "Select Title...",
    RAWG_RATING: "Select Title...",
    RAWG_SYNCED: "Select Title...",
    RAWG_UPDATED: "Select Title...",
    RELEASE_DATE: "Select Title...",
    SEARCH_PLACEHOLDER: "🔍 Search the NOMICON...",
    STATUS: "Select Title...",
    TBA_LABEL: "To Be Announced...",
    THUMBNAIL: "Select Title...",
    TITLE: "Type Your Favorite Game...",
    UNRATED_LABEL: "No Rating..."
  },

  // 8. Theme Display Names
  THEME_NAMES: {
    "modern-dark": "🌙 Modern Dark",
    "minimalist-light": "🌖 Minimalist Light",
    "modern-light": "☀️ Modern Light",
    "retro-arcade": "🕹️ Retro Arcade",
    "synthwave-sunset": "🌆 Synthwave Sunset",
    "cyberpunk": "⚡ Cyberpunk",
    "gothic-crimson": "🦇 Gothic Crimson",
    "wasteland-terminal": "☢️ Wasteland Terminal",
    "cozy-village": "🏡 Cozy Village"
  }
};