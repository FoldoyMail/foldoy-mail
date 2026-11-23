export const ME = { name: 'Mira Solberg', addr: 'mira@veil.no' };

const H = 60,
  D = 24 * 60;

export const ALIASES = [
  {
    id: 'a1',
    address: 'bikes.k2f@veil.no',
    note: 'Brekkevik Sykkel',
    active: true,
    created_ago: 41 * D,
    received: 6,
    blocked: 0,
  },
  {
    id: 'a2',
    address: 'news.p9t@veil.no',
    note: 'Fjellstua newsletter',
    active: true,
    created_ago: 88 * D,
    received: 14,
    blocked: 0,
  },
  {
    id: 'a3',
    address: 'parcels.m4q@veil.no',
    note: 'Kvikk Levering',
    active: true,
    created_ago: 20 * D,
    received: 3,
    blocked: 0,
  },
  {
    id: 'a4',
    address: 'deals.x7r@veil.no',
    note: 'Cruise contest',
    active: false,
    created_ago: 130 * D,
    received: 41,
    blocked: 128,
  },
];

const POWER = { name: 'Nordvik Energi', addr: 'kundeservice@nordvik-energi.no' };
const DENTIST = { name: 'Fjordtann Tannklinikk', addr: 'timebok@fjordtann.no' };
const JONAS = { name: 'Jonas Aalberg', addr: 'jonas@dm.fo' };
const SELMA = { name: 'Selma Okafor', addr: 'selma.okafor@foldoy.com' };
const HALLVARD = { name: 'Hallvard Lien', addr: 'hallvard@veil.no' };
const ANA = { name: 'Ana Ruiz', addr: 'ana.ruiz@foldoy.com' };

const billHtml = `
<h1>Your electricity bill for October</h1>
<p>Hello Mira,</p>
<p>Your bill for October is ready. It is paid by direct debit on 28 November.</p>
<table role="presentation">
  <tr><td>Used</td><td>412 kWh</td></tr>
  <tr><td>Power</td><td>NOK 389.20</td></tr>
  <tr><td>Grid rent</td><td>NOK 214.00</td></tr>
  <tr><td>To pay</td><td><b>NOK 603.20</b></td></tr>
</table>
<p>October was 9% lower than last October.</p>
<p>Nordvik Energi</p>`;

const billText = `Hello Mira,

Your bill for October is ready. It is paid by direct debit on 28 November.

Used: 412 kWh
Power: NOK 389.20
Grid rent: NOK 214.00
To pay: NOK 603.20

October was 9% lower than last October.

Nordvik Energi`;

const dentistText = `Hello Mira,

This is a reminder of your check-up on Tuesday 24 November at 08:30 with Dr. Hauge.

If you can't come, cancel or move it by Monday at 12:00 by answering this email or calling 71 22 40 10.

Fjordtann Tannklinikk
Strandgata 4`;

export const MESSAGES = [
  {
    id: 'm1',
    thread_id: 't1',
    folder: 'inbox',
    from: POWER,
    to: [ME],
    subject: 'Your electricity bill for October',
    ago: 14,
    unread: true,
    flagged: false,
    via_alias: null,
    text: billText,
    html: billHtml,
  },
  {
    id: 'm2',
    thread_id: 't2',
    folder: 'inbox',
    from: JONAS,
    to: [ME, SELMA],
    subject: 'Cabin weekend, the plan',
    ago: 52,
    unread: true,
    flagged: true,
    via_alias: null,
    text: `Hi both,

Here is where we landed. We take the 16:40 ferry on Friday and Hallvard picks us up at the quay. I'll bring food for Friday night, Selma has Saturday, Mira, can you do Sunday breakfast?

The cabin has no signal past the second bend, so if you need to reach anyone, do it before we leave the road.

Firewood is stacked behind the shed. Bring wool socks. Last time the floor was freezing until noon.

Jonas`,
  },
  {
    id: 'm3',
    thread_id: 't3',
    folder: 'inbox',
    from: { name: 'Brekkevik Sykkel', addr: 'ordre@brekkevik-sykkel.no' },
    to: [{ name: '', addr: 'bikes.k2f@veil.no' }],
    subject: 'Order 20417 has shipped',
    ago: 3 * H + 10,
    unread: false,
    flagged: false,
    via_alias: 'bikes.k2f@veil.no',
    text: `Thanks for your order.

Order 20417 left our workshop this morning.

Winter tyre, 29 x 2.25, studded: NOK 649
Tyre lever set: NOK 89
Shipping: free

Your parcel goes with Kvikk Levering. You'll get a message from them when it reaches your locker.

Brekkevik Sykkel`,
  },
  {
    id: 'm4',
    thread_id: 't4',
    folder: 'inbox',
    from: SELMA,
    to: [ME],
    subject: 'Photos from Saturday',
    ago: 22 * H,
    unread: false,
    flagged: false,
    via_alias: null,
    attachments: [
      {
        id: 'f1',
        name: 'pier.jpg',
        size: 2480000,
        type: 'image/jpeg',
        b64: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAGrAoADASIAAhEBAxEB/8QAGQABAQEBAQEAAAAAAAAAAAAAAAECBAcF/8QAIRABAQABAAsAAAAAAAAAAAAAABEDAQQGFRZSVZGj0dL/xAAZAQEBAQEBAQAAAAAAAAAAAAAAAgEEBQP/xAAZEQEBAAMBAAAAAAAAAAAAAAAAEQECFFH/2gAMAwEAAhEDEQA/APujUI7a5IyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFIyNQhSMjUIUjI1CFICwiFRBYQIgsIEQWECILCBEFhAiCwgRBYQIgsIEQWECILCBEFhAiCwgRBYQIgsIEQWECILCBEFhAiCwgRBYQIgsIEQWECILCBEFhAiCwgRBYQIgsIEQWECILCBEFhAiCwgRBYQIgsIEQWECILCBEFhAiCwgRBYQIgsIEQWECNCiapBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKKKJrYgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIgoUiChSIKFIoolUQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiiiapBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKIKFEFCiChRBQogoUQUKKKJVEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIgoEQUCIKBEFAiCgRBQIoohSCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCCgIKAgoCjQmqZGgoyNBRkaCjI0FGRoKMjQUZGgoyNBRkaCjI0FGRoKMjQUZGgoyNBRkaCjI0FGRoKMjQUZGgoyNBRkaCjI0FGRoKMjQUZGgoyNBRkaCjI0FGRoKMjQUZGgoyNBRkaCjI0FGRoKMjQUZGgoyNBRkaChCNCVRmEaAjMI0BGYRoCMwjQEZhGgIzCNARmEaAjMI0BGYRoCMwjQEZhGgIzCNARmEaAjMI0BGYRoCMwjQEZhGgIzCNARmEaAjMI0BGYRoCMwjQEZhGgIzCNARmEaAjMI0BGYRoCMwjQEZhGgIzCNARmEaAjMI0BGYRoCMwjQEZhGgIzCNARmEaAjMI0BGYRoCLCKJqkhFCiQihRIRQokIoUSEUKJCKFEhFCiQihRIRQokIoUSEUKJCKFEhFCiQihRIRQokIoUSEUKJCKFEhFCiQihRIRQokIoUSEUKJCKFEhFCiQihRIRQokIoUSEUKJCKFEhFCiQihRIRQokIoUSEUKJCKFEhFCiQihRIRQosIomqiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiQihSJCKFIkIoUiwiwia2JCLCFIkIsIUiQiwhSJCLCFIkIsIUiQiwhSJCLCFIkIsIUiQiwhSJCLCFIkIsIUiQiwhSJCLCFIkIsIUiQiwhSJCLCFIkIsIUiQiwhSJCLCFIkIsIUiQiwhSJCLCFIkIsIUi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lBqlZpQapWaUGKVmlGtUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oNUrNKDVKzSg1Ss0oM0rNKwapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQYpWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGaVmlY1qlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBilZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQapWaUGqVmlBqlZpQSlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAapWQGqVkBqlZAf/2Q==',
      },
      {
        id: 'f2',
        name: 'bonfire.jpg',
        size: 3120000,
        type: 'image/jpeg',
        b64: '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',
      },
    ],
    text: `Two from the pier. The bonfire one is a bit blurry but I like it anyway.

Selma`,
  },
  {
    id: 'm5',
    thread_id: 't5',
    folder: 'inbox',
    from: HALLVARD,
    to: [ME],
    subject: 'Re: the boat engine',
    ago: D + 5 * H,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `It was the fuel filter, like you said. Replaced it and she started on the second pull.

I'll leave the boat at the usual spot. Key under the blue bucket.

Hallvard

> Did you check the fuel filter? It clogged last autumn too.`,
  },
  {
    id: 'm6',
    thread_id: 't6',
    folder: 'inbox',
    from: { name: 'Lillevik bibliotek', addr: 'utlan@lillevik-bibliotek.no' },
    to: [ME],
    subject: 'Your loan is due on Friday',
    ago: 2 * D + 3 * H,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `Hello,

One loan is due this Friday:

The Long Winter Coast, by A. Haraldsen

You can renew it twice online, or return it to any branch.

Lillevik bibliotek`,
  },
  {
    id: 'm7',
    thread_id: 't7',
    folder: 'inbox',
    from: { name: 'Fjellstua', addr: 'post@fjellstua-kafe.no' },
    to: [{ name: '', addr: 'news.p9t@veil.no' }],
    unsubscribe: {
      one_click: true,
      url: 'https://fjellstua-kafe.no/news/leave?u=p9t',
      mailto: null,
    },
    subject: 'Winter menu and new opening hours',
    ago: 3 * D + 2 * H,
    unread: false,
    flagged: false,
    via_alias: 'news.p9t@veil.no',
    text: `From 1 December we open at 10 on weekdays and 9 on weekends.

New this winter: fish soup on Fridays, cardamom buns every day, and hot cider by the fire.

See you on the mountain,
Fjellstua`,
  },
  {
    id: 'm8',
    thread_id: 't8',
    folder: 'inbox',
    from: DENTIST,
    to: [ME],
    subject: 'Reminder: check-up on Tuesday at 08:30',
    ago: 4 * D + 6 * H,
    unread: false,
    flagged: false,
    via_alias: null,
    text: dentistText,
  },
  {
    id: 'm9',
    thread_id: 't9',
    folder: 'inbox',
    from: ANA,
    to: [ME],
    subject: 'Spanish lesson moves to Thursday',
    ago: 5 * D + 1 * H,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `Hola Mira,

Can we move Wednesday's lesson to Thursday at 18:00? Same place. Bring the short story we started, we'll finish it.

Ana`,
  },
  {
    id: 'm10',
    thread_id: 't10',
    folder: 'inbox',
    from: { name: 'Kvikk Levering', addr: 'varsel@kvikklevering.no' },
    to: [{ name: '', addr: 'parcels.m4q@veil.no' }],
    subject: 'Your parcel is in locker 14',
    ago: 6 * D + 4 * H,
    unread: false,
    flagged: false,
    via_alias: 'parcels.m4q@veil.no',
    text: `Your parcel from Brekkevik Sykkel is ready.

Locker 14, Strandgata 3
Code: 5521

Pick it up within 3 days.`,
    html: `<table width="100%" bgcolor="#F2F2F2" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 32px 12px">
<table width="560" bgcolor="#FFFFFF" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%"><tr><td style="padding: 36px 40px; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6">
<p style="margin: 0 0 24px; font-size: 20px; font-weight: bold">Kvikk Levering</p>
<p>Your parcel from Brekkevik Sykkel is ready.</p>
<p><b>Locker 14</b>, Strandgata 3<br>Code: <b>5521</b></p>
<p><a href="https://example.org/track" style="display: inline-block; padding: 10px 18px; background-color: #E8542F; color: #FFFFFF; text-decoration: none; border-radius: 4px">Track parcel</a></p>
<p style="color: #888888; font-size: 13px">Pick it up within 3 days, or it goes back to the sender.</p>
</td></tr></table></td></tr></table>`,
  },
  {
    id: 'm14',
    thread_id: 't14',
    folder: 'inbox',
    from: { name: 'Fjellnytt', addr: 'brev@fjellnytt.example' },
    to: [ME],
    subject: 'This week: three huts reopen for winter',
    ago: 3 * D + 2 * H,
    unread: true,
    flagged: false,
    via_alias: null,
    unsubscribe: { one_click: true, url: 'https://fjellnytt.example/u', mailto: null },
    text: `Three huts reopen for winter\n\nSkarvheimen, Finsehytta and Krækkja open on 1 December.`,
    html: `<html><head><style>
  body { margin: 0; }
  .wrap { max-width: 600px; margin: 0 auto; font-family: Georgia, serif; color: #222222; }
  .kicker { font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #5F7A3A; }
  h1 { font-size: 28px; line-height: 1.2; margin: 6px 0 16px; color: #111111; }
  p { font-size: 16px; line-height: 1.65; }
  a { color: #3E6B1F; }
  .card { border-top: 1px solid #DDDDDD; padding: 18px 0; }
  .foot { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #888888; border-top: 1px solid #DDDDDD; padding-top: 16px; }
  @media (prefers-color-scheme: dark) { .wrap { color: #EEEEEE; } }
  @media (max-width: 480px) { h1 { font-size: 23px; } }
  .bg { background: url(https://fjellnytt.example/bg.png); }
</style></head><body><div class="wrap">
<p class="kicker">Fjellnytt, week 46</p>
<h1>Three huts reopen for winter</h1>
<p>Skarvheimen, Finsehytta and Krækkja open on 1 December. Booking opens on Monday, and the first two weekends usually go within a day.</p>
<div class="card"><p><b>Ski tracks in Hemsedal</b><br>The first 40 km are prepared. <a href="https://fjellnytt.example/hemsedal?utm_source=brev">Track map</a></p></div>
<div class="card"><p><b>Avalanche course</b><br>Two seats left for the course in Sogndal on 6 December.</p></div>
<p class="foot">You get Fjellnytt because you signed up at fjellnytt.example.</p>
</div></body></html>`,
  },
  {
    id: 'm11',
    thread_id: 't11',
    folder: 'inbox',
    from: JONAS,
    to: [ME],
    subject: 'Ferry times',
    ago: 8 * D,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `Winter timetable starts on the 17th. Friday departures are 14:10, 16:40 and 19:05.`,
  },
  {
    id: 'm13',
    thread_id: 't2',
    folder: 'inbox',
    from: SELMA,
    to: [ME, JONAS],
    subject: 'Re: Cabin weekend, the plan',
    ago: 38,
    unread: true,
    flagged: false,
    via_alias: null,
    text: `Saturday dinner is on me. I'm thinking reindeer stew and the apple cake from last time.

Mira, I can bring the board games if you take the cards.

Selma

> I'll bring food for Friday night, Selma has Saturday, Mira, can you do Sunday breakfast?`,
  },
  {
    id: 'm12',
    thread_id: 't12',
    folder: 'inbox',
    from: SELMA,
    to: [ME],
    subject: 'That book I mentioned',
    ago: 10 * D,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `It's called The Lighthouse Year. Slow start, then you can't put it down.`,
  },

  {
    id: 'm20',
    thread_id: 't5',
    folder: 'sent',
    from: ME,
    to: [HALLVARD],
    subject: 'the boat engine',
    ago: 2 * D,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `Did you check the fuel filter? It clogged last autumn too.`,
  },
  {
    id: 'm21',
    thread_id: 't9',
    folder: 'sent',
    from: ME,
    to: [ANA],
    subject: 'Re: Spanish lesson moves to Thursday',
    ago: 5 * D,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `Thursday works. See you at 18.`,
  },
  {
    id: 'm30',
    thread_id: 't30',
    folder: 'drafts',
    from: ME,
    to: [JONAS],
    subject: 'Sunday breakfast',
    ago: 30,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `I'll bring eggs, bread and the good coffee. Anyone allergic to anything?`,
  },
  {
    id: 'm40',
    thread_id: 't40',
    folder: 'junk',
    from: { name: 'Prize Desk', addr: 'win@cruise-prize-desk.biz' },
    to: [{ name: '', addr: 'deals.x7r@veil.no' }],
    subject: 'Final notice: your cruise is waiting',
    ago: 2 * D,
    unread: true,
    flagged: false,
    via_alias: 'deals.x7r@veil.no',
    text: `Claim your cruise now before it expires.`,
  },
  {
    id: 'm50',
    thread_id: 't50',
    folder: 'archive',
    from: { name: 'Lillevik svømmehall', addr: 'post@lillevik-svommehall.no' },
    to: [ME],
    subject: 'Your swimming card is renewed',
    ago: 60 * D,
    unread: false,
    flagged: false,
    via_alias: null,
    text: `Hello Mira,\n\nYour card is renewed until 31 January. Lane swimming is 06:30 to 08:30 on weekdays.\n\nLillevik svømmehall`,
  },
];

export const DEMO_PASSPHRASE = 'harbour lantern seven';
