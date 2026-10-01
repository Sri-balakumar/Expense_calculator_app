// Plain-language explanation of each tab, shown by the "?" button (HelpFab).
// Written second-person and jargon-free, with one worked example each — the
// example is what actually makes a screen click for someone new.

import { HelpContent } from "../components/HelpFab";

export const HELP_MONTHLY: HelpContent = {
  title: "Monthly",
  body: [
    "This is your home base. Every month you track lives here as its own card, showing what you spent, what came in, and what's left.",
    "Tap “New / open month” to start a month. You enter the balance you're beginning with, and the app can carry over whatever was left from your last month automatically. Your recurring expenses are listed there too — untick any you don't want in the new month.",
    "Open a month to add your spends and income one by one. The card here keeps a running summary, plus a few insights — your biggest spending category, and how much of your salary the month has used up.",
    "Inside a month, every entry also shows the total left right after it — so you can scroll back and watch how the money actually drained away.",
  ],
  example:
    "You start August with ₹20,000 in hand. Over the month you add spends totalling ₹14,500 and a ₹2,000 freelance payment. The August card shows ₹14,500 spent and ₹7,500 left. When you create September, the app offers to carry that ₹7,500 across as your opening balance.",
};

export const HELP_PLANS: HelpContent = {
  title: "Plans",
  body: [
    "Plans are spends you know are coming but haven't made yet — rent, a phone bill, a gift. They let you see what your month really looks like once the money you've already committed is accounted for.",
    "Pick a month, then add a plan with a name and an amount. Your month then shows “after plans” — what's genuinely free to spend, not just what's sitting in your account today.",
    "When you actually pay, tap Done or Part. A part payment records a real entry in Monthly for you, so you never type it twice. You can also work the other way: tap an existing entry in Monthly and assign it to a plan.",
    "A plan closes itself once it's fully covered — you don't have to mark it done. If it turns out to cost more, tap “+ Add” to raise the amount and the plan re-opens with the difference still to pay.",
    "Not paying it this month? Move the plan to the next one and it carries across instead of quietly disappearing.",
  ],
  example:
    "It's the 3rd and you have ₹18,000 left, but rent of ₹12,000 is due on the 28th. Add rent as a plan and the month reads ₹6,000 after plans — the number you can actually spend. Pay ₹12,000 on the 28th, tap Done, and it's recorded in Monthly automatically.",
};

export const HELP_BUDGETS: HelpContent = {
  title: "Budgets",
  body: [
    "A budget is a spending pot that stands on its own, separate from your monthly tracking. Use one when you want a fixed amount to cover something specific and want to watch it drain.",
    "Give it a name and an amount, then add spends inside it just like a month. It shows what's left of the pot rather than what's left of your salary.",
    "This is different from Plans: a plan is one payment you're expecting, a budget is a pool you spend down over time.",
  ],
  example:
    "You set aside ₹15,000 for a weekend trip. Create a budget called “Goa trip — ₹15,000”, then log the tickets (₹4,200), the hotel (₹6,000) and food as you go. The budget shows ₹4,800 left, without any of it muddling your normal monthly numbers.",
};

export const HELP_GOALS: HelpContent = {
  title: "Goals",
  body: [
    "A goal is money you're building up rather than spending down — a phone, an emergency fund, a trip next year.",
    "Add savings into a goal whenever you put money aside, and the total grows. Set a target and you'll see how close you are.",
    "When you're ready to buy, plan the purchase straight out of the goal. The app can turn it into a real spend in whichever month you choose, so the money leaving your savings shows up in the right place.",
  ],
  example:
    "You want a ₹60,000 laptop. Create the goal, then add ₹10,000 each month as you save. After five months it shows ₹50,000 of ₹60,000. When you buy it in month six, plan the purchase from the goal and it's recorded as a spend that month — your savings and your month stay in step.",
};

export const HELP_YEAR: HelpContent = {
  title: "Year",
  body: [
    "The long view. Everything you've tracked, rolled up into one year so you can see patterns a single month can't show you.",
    "You get your total spend and income for the year, your average month, and a bar for each month so the expensive ones stand out immediately.",
    "Use the arrows at the top to move between years. Tap a month's bar to jump straight into it.",
  ],
  example:
    "Looking at 2026 you notice May and October are nearly double every other month — that's when your insurance premiums land. Now you know to plan for them next year instead of being surprised twice.",
};

export const HELP_DATA: HelpContent = {
  title: "Data",
  body: [
    "Everything the app has stored for you, counted up — how many entries, plans, budgets and goals exist, and how big all of it is.",
    "The Export backup button writes the lot to a single JSON file: every entry, plan, budget, goal, category and your profile settings, exactly as they are.",
    "Two things in this app can’t be undone — converting every amount to a new currency, and deleting a month with everything inside it. Take a backup first and you always have a way back.",
  ],
  example:
    "Before switching from rupees to dollars, you open Data, see 214 documents totalling 86 KB, and tap Export backup. The file lands in your downloads folder. If the conversion rate turns out wrong, you still have the original figures.",
};

export const HELP_PROFILE: HelpContent = {
  title: "Profile & settings",
  body: [
    "Everything that shapes how the rest of the app behaves.",
    "Set your salary so months can show what proportion you've spent, and your main balance for savings you're holding but not spending from.",
    "Make the app yours: add your own categories and payment methods with your own emoji, pick a colour accent, switch between light and dark, and choose your currency.",
    "Set up recurring expenses — anything that repeats every month — and they'll be added for you each time you create a new month.",
    "You can also lock the app with a PIN, and change your password or log out from here.",
  ],
  example:
    "You add “Rent — ₹12,000” as a recurring expense and a custom category called “Pets 🐕”. From then on, every new month starts with rent already entered, and your vet bills get their own line in the category breakdown instead of landing in “Other”.",
};
