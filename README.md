# Expense Calculator — React Native (Expo) App

Native Android rebuild of the Expense Calculator PWA. Reuses the **same Firebase
project** (`expense-app-280ee`) — existing accounts and all Firestore data work
unchanged. Only the UI was rewritten in React Native; all business logic and the
data model are ported from the web app.

## Run in development

```bash
cd ExpenseApp
npx expo start
```

Then either:
- Press `a` to open an Android emulator, or
- Scan the QR code with the **Expo Go** app on your Android phone.

> Note: a few native modules (charts gradients) are best tested in a real build,
> but the app runs in Expo Go for day-to-day development.

## Build a shareable APK (sideload — no Play Store)

Uses **EAS Build** in the cloud (free Expo account is enough). The `preview`
profile is configured to emit an installable `.apk` (not a Play `.aab`).

```bash
npm install -g eas-cli
eas login                 # one-time, use your Expo account
eas build:configure       # one-time (already have eas.json)
eas build -p android --profile preview
```

When the build finishes, EAS prints a download URL — share that `.apk` and
install it on any Android device (enable “install from unknown sources”).

### Local build (offline fallback — needs JDK 17 + Android SDK)

```bash
npx expo prebuild -p android
cd android
./gradlew assembleRelease
# APK at android/app/build/outputs/apk/release/app-release.apk
```

## Project layout

```
src/
  firebase/   config (same firebaseConfig as the PWA), auth, firestore data layer
  context/    AuthContext (user + profile, persisted via AsyncStorage)
  theme/      ThemeContext + light/dark color tokens (ported from style.css)
  components/ Feedback (toast/confirm/prompt), UI primitives, MonthPickerModal
  navigation/ RootNavigator (AuthGate), AppNavigator (stack), TabNavigator (tabs)
  screens/    Login, Signup, Monthly, Budgets, Plans, Year, Profile, Month, Plan
```

## Status — feature-complete

- ✅ Auth (login/signup/reset, persistent session, Gmail-only signup)
- ✅ Dashboard tabs: Monthly (trends chart, insights), Budgets, Plans, Year, Profile
- ✅ Month picker + create month (auto-adds recurring expenses)
- ✅ Month/Budget detail: realtime CRUD, total + breakdown, edit current balance,
     weekly breakdown, category budgets, search/filter, long-press multi-select
     (calculate / save / delete), saved calculations, calculator, details modal
- ✅ Plan detail: figures, add, mark-done (records expense), part-pay, undo,
     edit, delete, move-to-month (whole/unpaid), plan detail popup
- ✅ Year summary: 12-month tiles + bar chart + stats, year navigation
- ✅ Profile: edit name/salary, change password, recurring expenses,
     category budgets, dark-mode toggle, log out
- ✅ PDF export (expo-print) + Excel export (xlsx) with week picker, via share sheet
- ✅ Admin panel: lists all users + stats (admin email routes here automatically)
- ✅ All popups centered (fade); dark/light theme across every screen

Validated with `npx tsc --noEmit` + `npx expo export --platform android` (clean).

## Remaining (requires your accounts/device — I can't run these for you)

- Run on a phone: `npx expo start` → Expo Go, or `eas build -p android --profile preview` for the APK
- The `eas build` needs a (free) Expo login; the APK profile is already configured
