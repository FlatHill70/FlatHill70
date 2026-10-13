import { writeFileSync, mkdirSync } from 'node:fs';

const USER = process.env.GH_USER || 'FlatHill70';
const TOKEN = process.env.GH_TOKEN;
const OUT = process.env.OUT || 'assets/stats.svg';

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const { user } = await gql(
  `query($login:String!){ user(login:$login){ contributionsCollection { contributionYears contributionCalendar { totalContributions } } } }`,
  { login: USER },
);
const lastYear = user.contributionsCollection.contributionCalendar.totalContributions;
const years = user.contributionsCollection.contributionYears;

const days = new Map();
for (const year of years) {
  const data = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){ user(login:$login){ contributionsCollection(from:$from,to:$to){ contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`,
    { login: USER, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
  );
  for (const w of data.user.contributionsCollection.contributionCalendar.weeks)
    for (const d of w.contributionDays) days.set(d.date, d.contributionCount);
}

const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
const today = new Date().toISOString().slice(0, 10);
const past = sorted.filter(([date]) => date <= today);
const allTime = past.reduce((sum, [, n]) => sum + n, 0);

let longest = 0;
let run = 0;
for (const [, n] of past) {
  run = n > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}

let current = 0;
let i = past.length - 1;
if (i >= 0 && past[i][1] === 0) i--;
while (i >= 0 && past[i][1] > 0) {
  current++;
  i--;
}

const fmt = (n) => n.toLocaleString('en-US');
const stats = [
  [fmt(lastYear), 'Last 12 months'],
  [fmt(allTime), 'All-time contributions'],
  [`${current} ${current === 1 ? 'day' : 'days'}`, 'Current streak'],
  [`${longest} ${longest === 1 ? 'day' : 'days'}`, 'Longest streak'],
];

const W = 640;
const H = 110;
const col = W / stats.length;
const cells = stats
  .map(([value, label], idx) => {
    const x = col * idx + col / 2;
    const sep = idx ? `<line x1="${col * idx}" y1="22" x2="${col * idx}" y2="${H - 22}" stroke="#888888" stroke-opacity="0.3"/>` : '';
    return `${sep}<text x="${x}" y="54" class="v">${value}</text><text x="${x}" y="80" class="l">${label}</text>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub contributions: ${stats.map(([v, l]) => `${l} ${v}`).join(', ')}">
<style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;fill:#888888;text-anchor:middle}.v{font-size:26px;font-weight:600}.l{font-size:12px;letter-spacing:.02em}</style>
${cells}
</svg>
`;

mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(OUT, svg);
console.log(stats.map(([v, l]) => `${l}: ${v}`).join(' | '));
