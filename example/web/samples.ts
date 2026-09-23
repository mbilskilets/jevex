export const samples = [
  "The PDF export cuts off the last page of every report. Third time this month.",
  "Please add a dark mode, I work late and the white UI is brutal.",
  "We were charged for 12 seats but we only have 8 people. Can you fix the invoice?",
  "Genuinely the best onboarding I've seen. Took me four minutes to get value.",
  "How do I move a project between workspaces?",
  "If calendar sync stays broken through the weekend we're moving the team to Linear.",
  "Would love a Zapier integration so I can push new tasks from our CRM.",
  "Prices went up 40% with no notice. We're already comparing alternatives.",
  "Your support person Kasia fixed my issue in five minutes. Thank you!",
  "Is there an API rate limit? I can't find it in the docs.",
  "The mobile app freezes when I open a project with more than 200 tasks.",
  "Can we get recurring tasks? We do the same checklist every Monday.",
  "I want to downgrade to the free plan before my renewal on Friday.",
  "Search ignores Polish characters, typing ą or ł returns nothing.",
  "Honestly every release makes the product slower. Thinking about switching.",
  "Can I pay yearly by bank transfer instead of card?",
  "The new editor is so fast, it feels like a native app now.",
  "Do you support SSO with Okta for our 300 person team?",
  "Notifications stopped arriving after yesterday's update.",
  "Keyboard shortcuts for everything would make me very happy.",
  "Our trial ends tomorrow and the Salesforce import still fails. Hard to justify buying.",
  "Where do I find the invoices for last year? Our accountant needs them.",
  "Drag and drop in the board view is buttery smooth, great job.",
  "Dashboard charts show yesterday's numbers until I refresh twice.",
  "Could you add a Polish translation of the interface?",
  "The VAT number on my invoice is wrong and our finance team rejected it.",
  "We moved everything to Notion, please delete our workspace.",
  "Is there a way to export all comments with a project?",
  "Love the product, but the price for small teams is a bit steep.",
  "Login with Google loops back to the sign in page on Safari.",
];

export function pick(count: number) {
  const deck = [...samples];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck.slice(0, count);
}
