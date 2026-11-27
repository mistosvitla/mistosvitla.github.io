/**
 * Місто Світла — бот і сервер застосунку (Google Apps Script + Google Таблиця).
 *
 * Що робить цей файл:
 *  - бот: реєстрація (ім'я + кнопка «Поділитися контактом»), кнопка відкриття застосунку;
 *  - API для застосунку: перевіряє підпис Telegram (initData) і віддає/зберігає дані;
 *  - адмінка: події, налаштування, модерація, люди та ролі, заявки, розсилка;
 *  - розклад: вірш дня і нагадування перед зустрічами (функція tick, кожні 15 хв).
 *
 * Налаштування (Project Settings → Script properties):
 *   BOT_TOKEN   — токен бота від @BotFather
 *   APP_URL     — адреса застосунку на GitHub Pages, напр. https://name.github.io/misto-svitla/
 *   ADMIN_IDS   — Telegram ID адміністраторів через кому (свій ID підкаже @userinfobot)
 *   WEBAPP_URL  — адреса цього скрипта після Deploy (закінчується на /exec)
 * Потім один раз запустити setup(), а після Deploy — connectBot().
 *
 * Розклад (tick, кожні 15 хв): вірш дня, нагадування, о 20:00 — підсумок молитов авторам потреб,
 * у неділю о 20:00 — тижневе зведення адміністраторам.
 */

var TZ = 'Europe/Kiev';
var ROLES = ['member', 'prayer', 'leader', 'minister', 'admin'];
var KINDS = ['sunday', 'heaven', 'prayer', 'daily', 'leaders', 'teens', 'evenings'];
var SHEETS = {
  Users: ['id', 'name', 'phone', 'username', 'role', 'status', 'lang', 'created', 'seen', 'personal', 'src'],
  Events: ['id', 'type', 'dow', 'dates', 'time', 'kind', 'title_uk', 'title_ru', 'who_uk', 'who_ru', 'where_uk', 'where_ru', 'desc_uk', 'desc_ru', 'link', 'active', 'order'],
  Going: ['key', 'userId', 'at', 'present', 'reminded'],
  Needs: ['id', 'userId', 'text', 'vis', 'status', 'created', 'prayers'],
  Tests: ['id', 'userId', 'text', 'sign', 'status', 'created', 'needId'],
  Ads: ['id', 'userId', 'type', 'text', 'area', 'status', 'created'],
  Requests: ['id', 'userId', 'kind', 'topic', 'contact', 'status', 'created'],
  Rooms: ['key', 'status', 'card', 'link', 'stage', 'pin', 'leaderId', 'opened', 'closed', 'reacts', 'summary', 'hands'],
  RoomFeed: ['id', 'key', 'userId', 'type', 'text', 'at', 'extra'],
  CardVerses: ['id', 'card', 'ref', 'text_uk', 'text_ru', 'userId', 'who', 'created'],
  Sermons: ['id', 'date', 'time', 'title_uk', 'title_ru', 'speaker', 'verse', 'ask', 'text', 'status', 'created', 'video', 'vfrom', 'vto'],
  Cheers: ['key', 'fromId', 'toId', 'kind', 'at'],
  Bingo: ['key', 'week', 'userId', 'marks', 'at'],
  Settings: ['key', 'value'],
  Log: ['at', 'where', 'message']
};

var SETTINGS_DEFAULT = {
  playlist: '',
  address_uk: 'Київ, пр. Степана Бандери, 23, метро «Почайна»',
  address_ru: 'Киев, пр. Степана Бандеры, 23, метро «Почайна»',
  map: 'проспект Степана Бандери 23 Київ',
  ytChannel: 'UCmK9YFNcVwyrPgj060EM3-g', // ID каналу YouTube (UC…): за ним застосунок показує поточну трансляцію
  monoJar: '', // посилання на банку: https://send.monobank.ua/jar/…
  mono: '4441 1110 4143 8320',
  iban: 'UA783052990000026005030102192',
  recipient: 'РО РГ ХМЦ МІСТО СВІТЛА',
  edrpou: '19261358',
  purpose: 'добровільні пожертвування',
  paypal: 'centreofdm@gmail.com',
  verseTime: '07:30',
  remind: '60',
  cardStart: '2026-11-09',
  youth_uk: 'Тут будуть свої події, стрічка та посилання на чат молоді.',
  youth_ru: 'Здесь будут свои события, лента и ссылка на чат молодёжи.',
  tg: 'https://t.me/mistosvitlachurchkyiv',
  ig: 'https://www.instagram.com/mistosvitlachurch/',
  yt: 'https://www.youtube.com/user/infogorodsveta',
  fb: 'https://www.facebook.com/mistosvitlachurch/',
  teams: 'Прославлення | Прославление\nЗвук | Звук\nВідео | Видео\nЗустріч гостей | Встреча гостей\nДитяче служіння | Детское служение\nМолодіжка | Молодёжка\nМолитовна команда | Молитвенная команда'
};

var EVENTS_DEFAULT = [
  { id: 'tg', type: 'weekly', dow: [0, 1, 2, 3, 4, 5, 6], dates: [], time: '08:00', kind: 'daily', title_uk: 'Ранкова молитва', title_ru: 'Утренняя молитва', where_uk: 'Telegram', where_ru: 'Telegram', link: 'https://t.me/mistosvitlachurchkyiv' },
  { id: 'mon', type: 'weekly', dow: [1], dates: [], time: '18:30', kind: 'prayer', title_uk: 'Молитва в церкві', title_ru: 'Молитва в церкви', where_uk: 'у церкві', where_ru: 'в церкви' },
  { id: 'wed', type: 'weekly', dow: [3], dates: [], time: '18:00', kind: 'heaven', title_uk: 'HeavenOS', title_ru: 'HeavenOS', who_uk: 'пастор Володимир', who_ru: 'пастор Владимир' },
  { id: 'thu', type: 'weekly', dow: [4], dates: [], time: '18:00', kind: 'heaven', title_uk: 'HeavenOS', title_ru: 'HeavenOS', who_uk: 'Константин Мельник', who_ru: 'Константин Мельник' },
  { id: 'sun', type: 'weekly', dow: [0], dates: [], time: '11:00', kind: 'sunday', title_uk: 'Недільне служіння', title_ru: 'Воскресное служение', where_uk: 'пр. Степана Бандери, 23', where_ru: 'пр. Степана Бандеры, 23' },
  { id: 'leaders', type: 'dates', dow: [], dates: ['2026-11-11'], time: '18:00', kind: 'leaders', title_uk: 'Лідери разом', title_ru: 'Лидеры вместе', desc_uk: 'Зустріч пасторів і лідерів для натхнення, навчання та спорядження для служіння.', desc_ru: 'Встреча пасторов и лидеров для вдохновения, обучения и снаряжения для служения.' },
  { id: 'teens', type: 'dates', dow: [], dates: ['2026-11-15'], time: '11:00', kind: 'teens', title_uk: 'Підлітки ведуть прославлення', title_ru: 'Подростки ведут прославление', desc_uk: 'На недільному служінні.', desc_ru: 'На воскресном служении.' },
  { id: 'evenings', type: 'dates', dow: [], dates: ['2026-11-24', '2026-11-25', '2026-11-26'], time: '18:00', kind: 'evenings', title_uk: 'Вечори в Божій присутності', title_ru: 'Вечера в Божьем присутствии', desc_uk: 'Три вечори поспіль. 26.11 з прославленням.', desc_ru: 'Три вечера подряд. 26.11 с прославлением.' }
];

/** Вірші до карток HeavenOS, які лідер підготував заздалегідь (додаються в таблицю один раз). */
var VERSES_SEED = { 18: [{"ref": "Римлян 8:28", "uk": "Знаємо, що тим, які люблять Бога, котрі покликані за Його постановою, все сприяє до добра.", "who": "Костя"}, {"ref": "Ісаї 43:18–19", "uk": "Не згадуйте про те, що було раніше, і не роздумуйте про давнє. Ось Я чиню нове; тепер воно з’являється, хіба ви не знаєте цього? Я прокладу дорогу в пустелі, ріки в степу.", "who": "Костя"}, {"ref": "Івана 12:24", "uk": "Істинно, істинно кажу вам: якщо зерно пшениці, впавши на землю, не вмре, воно залишиться одне. Якщо ж умре, – принесе великий урожай.", "who": "Костя"}, {"ref": "Псалом 34:19", "uk": "Господь близький до тих, чиї серця у скорботі, й спасає засмучених духом.", "who": "Костя"}, {"ref": "2 Коринтян 4:16–18", "uk": "Тому ми не втрачаємо відваги. Хоч наша зовнішня людина зітліває, проте наша внутрішня людина оновлюється день у день. Адже наше тимчасове легке терпіння готує нам понад міру вічну славу, оскільки ми не дивимося на видиме, а на те, що невидиме, бо видиме – тимчасове, а невидиме – вічне.", "who": "Костя"}, {"ref": "Якова 1:2–4", "uk": "Брати мої, майте велику радість, коли попадаєте в різні випробування, знаючи, що випробування вашої віри розвиває терпеливість. А терпеливість нехай має досконалу дію, щоб ви були досконалі та бездоганні й щоб нічого вам не бракувало.", "who": "Костя"}, {"ref": "Римлян 12:2", "uk": "І не пристосовуйтеся до цього віку, але змінюйтеся оновленням [вашого] розуму, щоб ви пізнавали, що є Божа воля: добре, приємне і досконале.", "who": "Костя"}] };

/** Вірші дня (Новий Завіт, Огієнко / Синодальний). Той самий список і та сама формула дня, що й у застосунку. */
var VERSES = [{"loc":[0,5,14],"ref":{"uk":"Матвія 5:14","ru":"Матфея 5:14","en":"Matthew 5:14"},"t":{"uk":"Ви світло для світу. Не може сховатися місто, що стоїть на верховині гори.","ru":"Вы — свет мира. Не может укрыться город, стоящий на верху горы.","en":"Ye are the light of the world. A city that is set on an hill cannot be hid."}},{"loc":[3,3,16],"ref":{"uk":"Івана 3:16","ru":"Иоанна 3:16","en":"John 3:16"},"t":{"uk":"Так бо Бог полюбив світ, що дав Сина Свого Однородженого, щоб кожен, хто вірує в Нього, не згинув, але мав життя вічне.","ru":"Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного, дабы всякий верующий в Него, не погиб, но имел жизнь вечную.","en":"For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."}},{"loc":[8,4,16],"ref":{"uk":"1 Івана 4:16","ru":"1 Иоанна 4:16","en":"1 John 4:16"},"t":{"uk":"Ми пізнали й увірували в ту любов, що Бог її має до нас. Бог є любов, і хто пробуває в любові, пробуває той в Бозі, і в нім Бог пробуває!","ru":"И мы познали любовь, которую имеет к нам Бог, и уверовали в нее. Бог есть любовь, и пребывающий в любви пребывает в Боге, и Бог в нем.","en":"And we have known and believed the love that God hath to us. God is love; and he that dwelleth in love dwelleth in God, and God in him."}},{"loc":[1,5,36],"ref":{"uk":"Марка 5:36","ru":"Марка 5:36","en":"Mark 5:36"},"t":{"uk":"А Ісус, як почув слово сказане, промовляє до старшини синагоги: „Не лякайсь, — тільки віруй!","ru":"Но Иисус, услышав сии слова, тотчас говорит начальнику синагоги: не бойся, только веруй.","en":"As soon as Jesus heard the word that was spoken, he saith unto the ruler of the synagogue, Be not afraid, only believe."}},{"loc":[17,4,13],"ref":{"uk":"Филип’ян 4:13","ru":"Филиппийцам 4:13","en":"Philippians 4:13"},"t":{"uk":"Я все можу в Тім, Хто мене підкріпляє, — в Ісусі Христі.","ru":"Все могу в укрепляющем меня Иисусе Христе.","en":"I can do all things through Christ which strengtheneth me."}},{"loc":[3,8,12],"ref":{"uk":"Івана 8:12","ru":"Иоанна 8:12","en":"John 8:12"},"t":{"uk":"І знову Ісус промовляв до них, кажучи: „Я Світло для світу. Хто йде вслід за Мною, не буде ходити у темряві той, але матиме світло життя“.","ru":"Опять говорил Иисус к народу и сказал им: Я свет миру; кто последует за Мною, тот не будет ходить во тьме, но будет иметь свет жизни.","en":"Then spake Jesus again unto them, saying, I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life."}},{"loc":[19,5,16],"ref":{"uk":"1 Солунян 5:16","ru":"1 Фессалоникийцам 5:16","en":"1 Thessalonians 5:16"},"t":{"uk":"Завжди радійте!","ru":"Всегда радуйтесь.","en":"Rejoice evermore."}},{"loc":[0,11,28],"ref":{"uk":"Матвія 11:28","ru":"Матфея 11:28","en":"Matthew 11:28"},"t":{"uk":"Прийдіть до Мене, усі струджені та обтяжені, — і Я вас заспокою!","ru":"Придите ко Мне все труждающиеся и обремененные, и Я успокою вас;","en":"Come unto me, all ye that labour and are heavy laden, and I will give you rest."}},{"loc":[12,8,28],"ref":{"uk":"Римлян 8:28","ru":"Римлянам 8:28","en":"Romans 8:28"},"t":{"uk":"І знаємо, що тим, хто любить Бога, хто покликаний Його постановою, усе допомагає на добре.","ru":"Притом знаем, что любящим Бога, призванным по Его изволению, все содействует ко благу.","en":"And we know that all things work together for good to them that love God, to them who are the called according to his purpose."}},{"loc":[17,4,6],"ref":{"uk":"Филип’ян 4:6","ru":"Филиппийцам 4:6","en":"Philippians 4:6"},"t":{"uk":"Ні про що не турбуйтесь, а в усьому нехай виявляються Богові ваші бажання молитвою й проханням з подякою.","ru":"Не заботьтесь ни о чем, но всегда в молитве и прошении с благодарением открывайте свои желания пред Богом,","en":"Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God."}},{"loc":[0,6,33],"ref":{"uk":"Матвія 6:33","ru":"Матфея 6:33","en":"Matthew 6:33"},"t":{"uk":"Шукайте ж найперш Царства Божого й праведности Його, — а все це вам додасться.","ru":"Ищите же прежде Царства Божия и правды Его, и это все приложится вам.","en":"But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you."}},{"loc":[3,14,27],"ref":{"uk":"Івана 14:27","ru":"Иоанна 14:27","en":"John 14:27"},"t":{"uk":"Зоставляю вам мир, мир Свій вам даю! Я даю вам не так, як дає світ. Серце ваше нехай не тривожиться, ані не лякається!","ru":"Мир оставляю вам, мир Мой даю вам; не так, как мир дает, Я даю вам. Да не смущается сердце ваше и да не устрашается.","en":"Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid."}},{"loc":[12,12,2],"ref":{"uk":"Римлян 12:2","ru":"Римлянам 12:2","en":"Romans 12:2"},"t":{"uk":"і не стосуйтесь до віку цього, але перемініться відновою вашого розуму, щоб пізнати вам, що то є воля Божа, — добро, приємність та досконалість.","ru":"и не сообразуйтесь с веком сим, но преобразуйтесь обновлением ума вашего, чтобы вам познавать, что есть воля Божия, благая, угодная и совершенная.","en":"And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God."}},{"loc":[15,5,22],"ref":{"uk":"Галатів 5:22","ru":"Галатам 5:22","en":"Galatians 5:22"},"t":{"uk":"А плід Духа: любов, радість, мир, довготерпіння, лагідність, добрість, вірність,","ru":"Плод же духа: любовь, радость, мир, долготерпение, благость, милосердие, вера,","en":"But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith,"}},{"loc":[16,2,8],"ref":{"uk":"Ефесян 2:8","ru":"Ефесянам 2:8","en":"Ephesians 2:8"},"t":{"uk":"Бо спасені ви благодаттю через віру, а це не від вас, то дар Божий,","ru":"Ибо благодатью вы спасены через веру, и сие не от вас, Божий дар:","en":"For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:"}},{"loc":[14,5,17],"ref":{"uk":"2 Коринтян 5:17","ru":"2 Коринфянам 5:17","en":"2 Corinthians 5:17"},"t":{"uk":"Тому то, коли хто в Христі, той створіння нове, - стародавнє минуло, ото сталось нове!","ru":"Итак, кто во Христе, тот новая тварь; древнее прошло, теперь все новое.","en":"Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new."}},{"loc":[25,11,1],"ref":{"uk":"Євреїв 11:1","ru":"Евреям 11:1","en":"Hebrews 11:1"},"t":{"uk":"А віра — то підстава сподіваного, доказ небаченого.","ru":"Вера же есть осуществление ожидаемого и уверенность в невидимом.","en":"Now faith is the substance of things hoped for, the evidence of things not seen."}},{"loc":[5,1,5],"ref":{"uk":"Якова 1:5","ru":"Иакова 1:5","en":"James 1:5"},"t":{"uk":"А якщо кому з вас не стачає мудрости, нехай просить від Бога, що всім дає просто, та не докоряє, — і буде вона йому дана.","ru":"Если же у кого из вас недостает мудрости, да просит у Бога, дающего всем просто и без упреков, — и дастся ему.","en":"If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him."}},{"loc":[6,5,7],"ref":{"uk":"1 Петра 5:7","ru":"1 Петра 5:7","en":"1 Peter 5:7"},"t":{"uk":"Покладіть на Нього всю вашу журбу, бо Він опікується вами!","ru":"Все заботы ваши возложите на Него, ибо Он печется о вас.","en":"Casting all your care upon him; for he careth for you."}},{"loc":[0,7,7],"ref":{"uk":"Матвія 7:7","ru":"Матфея 7:7","en":"Matthew 7:7"},"t":{"uk":"Просіть — і буде вам дано, шукайте — і знайдете, стукайте — і відчинять вам;","ru":"Просите, и дано будет вам; ищите, и найдете; стучите, и отворят вам;","en":"Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you:"}},{"loc":[3,15,5],"ref":{"uk":"Івана 15:5","ru":"Иоанна 15:5","en":"John 15:5"},"t":{"uk":"Я — Виноградина, ви — галуззя! Хто в Мені перебуває, а Я в ньому, той рясно зароджує, бо без Мене нічого чинити не можете ви.","ru":"Я есмь лоза, а вы ветви; кто пребывает во Мне, и Я в нем, тот приносит много плода; ибо без Меня не можете делать ничего.","en":"I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing."}},{"loc":[12,15,13],"ref":{"uk":"Римлян 15:13","ru":"Римлянам 15:13","en":"Romans 15:13"},"t":{"uk":"Бог же надії нехай вас наповнить усякою радістю й миром у вірі, щоб ви збагатились надією, силою Духа Святого!","ru":"Бог же надежды да исполнит вас всякой радости и мира в вере, дабы вы, силою Духа Святаго, обогатились надеждою.","en":"Now the God of hope fill you with all joy and peace in believing, that ye may abound in hope, through the power of the Holy Ghost."}},{"loc":[22,1,7],"ref":{"uk":"2 Тимофія 1:7","ru":"2 Тимофею 1:7","en":"2 Timothy 1:7"},"t":{"uk":"Бо не дав нам Бог духа страху, але сили, і любови, і здорового розуму.","ru":"ибо дал нам Бог духа не боязни, но силы и любви и целомудрия.","en":"For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind."}},{"loc":[18,3,23],"ref":{"uk":"Колосян 3:23","ru":"Колоссянам 3:23","en":"Colossians 3:23"},"t":{"uk":"І все, що тільки чините, робіть від душі, немов Господеві, а не людям!","ru":"И все, что делаете, делайте от души, как для Господа, а не для человеков,","en":"And whatsoever ye do, do it heartily, as to the Lord, and not unto men;"}},{"loc":[13,13,4],"ref":{"uk":"1 Коринтян 13:4","ru":"1 Коринфянам 13:4","en":"1 Corinthians 13:4"},"t":{"uk":"Любов довготерпить, любов милосердствує, не заздрить, любов не величається, не надимається,","ru":"Любовь долготерпит, милосердствует, любовь не завидует, любовь не превозносится, не гордится,","en":"Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,"}},{"loc":[25,13,8],"ref":{"uk":"Євреїв 13:8","ru":"Евреям 13:8","en":"Hebrews 13:8"},"t":{"uk":"Ісус Христос учора, і сьогодні, і навіки Той Самий!","ru":"Иисус Христос вчера и сегодня и во веки Тот же.","en":"Jesus Christ the same yesterday, and to day, and for ever."}},{"loc":[26,3,20],"ref":{"uk":"Об’явлення 3:20","ru":"Откровение 3:20","en":"Revelation 3:20"},"t":{"uk":"Ось Я стою під дверима та стукаю: коли хто почує Мій голос і двері відчинить, Я до нього ввійду, і буду вечеряти з ним, а він зо Мною.","ru":"Се, стою у двери и стучу: если кто услышит голос Мой и отворит дверь, войду к нему, и буду вечерять с ним, и он со Мною.","en":"Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me."}},{"loc":[2,1,37],"ref":{"uk":"Луки 1:37","ru":"Луки 1:37","en":"Luke 1:37"},"t":{"uk":"Бо „для Бога нема неможливої жодної речі!“","ru":"ибо у Бога не останется бессильным никакое слово.","en":"For with God nothing shall be impossible."}},{"loc":[8,1,9],"ref":{"uk":"1 Івана 1:9","ru":"1 Иоанна 1:9","en":"1 John 1:9"},"t":{"uk":"Коли ми свої гріхи визнаємо, то Він вірний та праведний, щоб гріхи нам простити, та очистити нас від неправди всілякої.","ru":"Если исповедуем грехи наши, то Он, будучи верен и праведен, простит нам грехи наши и очистит нас от всякой неправды.","en":"If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness."}},{"loc":[0,28,20],"ref":{"uk":"Матвія 28:20","ru":"Матфея 28:20","en":"Matthew 28:20"},"t":{"uk":"навчаючи їх зберігати все те, що Я вам заповів. І ото, Я перебуватиму з вами повсякденно аж до кінця віку“! Амінь.","ru":"уча их соблюдать все, что Я повелел вам; и се, Я с вами во все дни до скончания века. Аминь.","en":"Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world. Amen."}},{"loc":[12,5,8],"ref":{"uk":"Римлян 5:8","ru":"Римлянам 5:8","en":"Romans 5:8"},"t":{"uk":"А Бог доводить Свою любов до нас тим, що Христос умер за нас, коли ми були ще грішниками.","ru":"Но Бог Свою любовь к нам доказывает тем, что Христос умер за нас, когда мы были еще грешниками.","en":"But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us."}}];

/* ================= вхідні точки ================= */

function doGet(e) {
  var key = e && e.parameter && e.parameter.ics;
  if (key) return icsOut(String(key), String(e.parameter.l || 'uk'));
  if (e && e.parameter && e.parameter.pub) return out(publicOut());
  return out({ ok: true, app: 'misto-svitla' });
}

/* Публічні дані для сторінки гостей: розклад і контакти. Без людей і без особистого. */
function publicOut() {
  var c = CacheService.getScriptCache(), hit = c.get('pub');
  if (hit) return JSON.parse(hit);
  var st = settingsAll(), keys = ['address_uk', 'address_ru', 'map', 'tg', 'ig', 'yt', 'fb'], set = {};
  keys.forEach(function (k) { set[k] = st[k]; });
  var res = { events: rows('Events').map(eventOut).filter(function (e) { return e.active; }), settings: set };
  c.put('pub', JSON.stringify(res), 600);
  return res;
}

/* Файл календаря (.ics) для однієї зустрічі: ?ics=<id>@<yyyy-mm-dd>&l=uk|ru|en. Розклад і так публічний. */
function icsOut(key, l) {
  var x = eventByKey(key);
  if (!x || !occursOn(x.ev, x.date)) return ContentService.createTextOutput('Not found');
  l = l === 'ru' || l === 'en' ? l : 'uk';
  var st = settingsAll(), start = startOf(x.date, x.ev.time), end = new Date(start.getTime() + (x.ev.kind === 'sunday' ? 120 : 90) * 60000);
  var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
  var esc = function (t) { return String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); };
  var pick = function (o) { return o && (o[l] || o.uk) || ''; };
  var place = x.ev.link ? x.ev.link : (pick(x.ev.where) && !/церкв/i.test(pick(x.ev.where)) ? pick(x.ev.where) : st['address_' + (l === 'ru' ? 'ru' : 'uk')]);
  var desc = [pick(x.ev.who), pick(x.ev.desc)].filter(Boolean).join('. ');
  var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Misto Svitla//UA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + key.replace(/[^\w@.-]/g, '') + '@misto-svitla', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(start), 'DTEND:' + f(end),
    'SUMMARY:' + esc(pick(x.ev.title)), 'LOCATION:' + esc(place), 'DESCRIPTION:' + esc(desc),
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(pick(x.ev.title)), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e && e.postData ? e.postData.contents : '{}'); } catch (err) { return out({ error: 'Некоректний запит' }); }
  if (body.update_id !== undefined) {
    try {
      var cache = CacheService.getScriptCache(), k = 'u' + body.update_id;
      if (!cache.get(k)) { cache.put(k, '1', 21600); onUpdate(body); }
    } catch (err) { log('bot', err); }
    return HtmlService.createHtmlOutput('ok'); // 200 без редиректу: на 302 Telegram зупиняє доставку
  }
  try { return out(handleApi(body)); }
  catch (err) {
    var msg = err && err.message || String(err);
    if (!/[а-яіїєґ]/i.test(msg)) log('api ' + (body.action || ''), err); // помилки вводу користувача не засмічують Log
    return out({ error: msg });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= таблиця ================= */

var _ss = null, _cache = {};
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function ss() {
  if (_ss) return _ss;
  var id = prop('SHEET_ID');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_ss) throw new Error('Не знайдено таблицю. Відкрийте скрипт через Розширення → Apps Script у таблиці або вкажіть SHEET_ID.');
  return _ss;
}
var _sheets = {};
function sheet(name) {
  if (_sheets[name]) return _sheets[name];
  var sh = ss().getSheetByName(name);
  if (sh && sh.getLastColumn() < SHEETS[name].length) sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold'); // нові колонки після оновлення
  if (!sh) {
    sh = ss().insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), SHEETS[name].length)).setNumberFormat('@');
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  _sheets[name] = sh;
  return sh;
}
function rows(name) {
  if (_cache[name]) return _cache[name];
  var sh = sheet(name), head = SHEETS[name], n = sh.getLastRow(), res = [];
  if (n > 1) {
    var vals = sh.getRange(2, 1, n - 1, head.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { _r: i + 2 };
      for (var j = 0; j < head.length; j++) o[head[j]] = cell(head[j], vals[i][j]);
      res.push(o);
    }
  }
  _cache[name] = res;
  return res;
}
function cell(col, v) {
  if (v instanceof Date) return col === 'time' || v.getFullYear() < 1901 ? Utilities.formatDate(v, TZ, 'HH:mm') : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}
function rowValues(name, o) {
  return SHEETS[name].map(function (h) { var v = o[h]; return v === undefined || v === null ? '' : String(v); });
}
function addRow(name, o) { sheet(name).appendRow(rowValues(name, o)); delete _cache[name]; }
function setRow(name, o) { sheet(name).getRange(o._r, 1, 1, SHEETS[name].length).setValues([rowValues(name, o)]); }
function delRows(name, list) {
  var sh = sheet(name);
  list.map(function (o) { return o._r; }).sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  delete _cache[name];
}
function findUser(id) {
  id = String(id);
  var all = rows('Users');
  var hit = null;
  for (var i = 0; i < all.length; i++) if (String(all[i].id) === id) { if (all[i].status === 'ok') return all[i]; hit = hit || all[i]; }
  return hit; // якщо рядків кілька — беремо зареєстрований
}
function findBy(name, id) {
  var all = rows(name);
  for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i];
  return null;
}
function newId() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function parseJ(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function first(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
function kyivDate(d) { return Utilities.formatDate(d || new Date(), TZ, 'yyyy-MM-dd'); }
function startOf(date, time) { return Utilities.parseDate(date + ' ' + time, TZ, 'yyyy-MM-dd HH:mm'); }
function log(where, err) {
  try { addRow('Log', { at: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), where: where, message: String(err && err.stack || err).slice(0, 3000) }); } catch (e) {}
}
function roleOf(u) {
  var admins = prop('ADMIN_IDS').split(',').map(function (s) { return s.trim(); });
  if (admins.indexOf(String(u.id)) >= 0) return 'admin';
  return ROLES.indexOf(u.role) >= 0 ? u.role : 'member';
}
function has(role, list) { return list.indexOf(role) >= 0; }
/** Звідки людина прийшла: src_instagram у посиланні → instagram; запрошення на подію → friend. */
function srcOf(param) {
  var p = String(param || '').replace(/^\/start\s+/, '');
  var m = p.match(/^src_([a-z0-9]{1,20})$/);
  if (m) return m[1];
  return /^ev_/.test(p) ? 'friend' : '';
}
var SRC_NAMES = { instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', flyer: 'листівка', screen: 'екран у залі', maps: 'Google Maps', site: 'сторінка для гостей', friend: 'від друзів' };
function srcName(k) { return SRC_NAMES[k] || k || 'невідомо'; }
/** Мова людини для повідомлень бота: uk, ru або en (en — лише якщо обрали англійську в застосунку). */
function langOf(x) { return x && (x.lang === 'ru' || x.lang === 'en') ? x.lang : 'uk'; }

function settingsAll() {
  var o = {}, k;
  for (k in SETTINGS_DEFAULT) o[k] = SETTINGS_DEFAULT[k];
  rows('Settings').forEach(function (r) {
    if (!(r.key in SETTINGS_DEFAULT)) return;
    var v = r.value;
    // Таблиця сама перетворює «07:30» на час (1899-12-30). Повертаємо назад у «ГГ:ХХ».
    if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, TZ, 'HH:mm');
    o[r.key] = String(v);
  });
  return o;
}

/* ================= перевірка Telegram ================= */

/* Перевіряє рядок, підписаний Telegram (initData або відповідь requestContact). Повертає поля. */
function verifySigned(str) {
  var token = prop('BOT_TOKEN'), pairs = String(str || '').split('&'), hash = '', kv = [], f = {};
  pairs.forEach(function (p) {
    var i = p.indexOf('='); if (i < 0) return;
    var k = p.slice(0, i), v = decodeURIComponent(p.slice(i + 1));
    if (k === 'hash') { hash = v; return; }
    kv.push([k, v]); f[k] = v;
  });
  kv.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  var dcs = kv.map(function (x) { return x[0] + '=' + x[1]; }).join('\n');
  var secret = Utilities.computeHmacSha256Signature(Utilities.newBlob(token).getBytes(), Utilities.newBlob('WebAppData').getBytes());
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(dcs).getBytes(), secret);
  var hex = sig.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  if (!hash || hex !== hash) throw new Error('Не вдалося перевірити вхід. Закрийте й відкрийте застосунок знову');
  return f;
}

function checkInit(initData) {
  if (!initData) throw new Error('Відкрийте застосунок у Telegram');
  var f = verifySigned(initData), user = f.user ? JSON.parse(f.user) : null;
  if (Date.now() / 1000 - Number(f.auth_date || 0) > 7 * 86400) throw new Error('Сесія застаріла. Закрийте й відкрийте застосунок знову');
  if (!user || !user.id) throw new Error('Немає даних користувача');
  user._src = srcOf(f.start_param);
  return user;
}

/* Номер приходить двома шляхами одночасно (застосунок і чат бота). Вітаємо й сповіщаємо лише раз. */
function claimJoin(id) {
  var lock = LockService.getScriptLock(), c = CacheService.getScriptCache(), k = 'join:' + id;
  try { lock.waitLock(10000); } catch (e) { return !c.get(k); }
  try { if (c.get(k)) return false; c.put(k, '1', 21600); return true; }
  finally { lock.releaseLock(); }
}

/* Контакт прямо із застосунку: Telegram підписує номер так само, як initData, тож бот для цього не потрібен. */
function contactFromApp(tgUser, u, body) {
  var id = String(tgUser.id), f = verifySigned(body.contact), c = parseJ(f.contact, {});
  if (String(c.user_id) !== id || !c.phone_number) throw new Error('Це не ваш номер');
  var lang = String(tgUser.language_code || '').indexOf('ru') === 0 ? 'ru' : 'uk', t = T[lang];
  var name = txt(body.name, 60).replace(/\s+/g, ' ').trim() || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
  if (!u) { addRow('Users', { id: id, name: name, phone: '', username: tgUser.username || '', role: 'member', status: 'contact', lang: lang, created: Date.now(), src: tgUser._src || '' }); _cache = {}; u = findUser(id); }
  var wasOk = u.status === 'ok';
  if (!u.name || name) u.name = name || u.name;
  u.phone = (String(c.phone_number).charAt(0) === '+' ? '' : '+') + c.phone_number;
  u.username = tgUser.username || u.username || ''; u.status = 'ok'; u.lang = u.lang || lang;
  setRow('Users', u);
  if (!wasOk && claimJoin(id)) {
    try { applyInvite(u, t); welcome(id, u, t); } catch (e) {} // якщо людина не дала боту писати — не страшно
    notifyRoles(['admin'], '👋 Новий учасник: ' + u.name + ', ' + u.phone + (u.username ? ', @' + u.username : '') + ' (через застосунок' + (u.src ? ', джерело: ' + srcName(u.src) : '') + ')');
  }
  return { ok: true };
}

/* In-app sign-up: the app sends the name, then asks Telegram for the contact; the contact arrives to the bot and finishes it. */
function registerFromApp(tgUser, u, body) {
  var id = String(tgUser.id), name = txt(body.name, 60).replace(/\s+/g, ' ').trim();
  if (name.length < 2) throw new Error('Вкажіть ім’я');
  var lang = String(tgUser.language_code || '').indexOf('ru') === 0 ? 'ru' : 'uk';
  if (!u) { addRow('Users', { id: id, name: name, phone: '', username: tgUser.username || '', role: 'member', status: 'contact', lang: lang, created: Date.now(), src: tgUser._src || '' }); return { ok: true, status: 'contact' }; }
  u.name = name; u.username = tgUser.username || u.username || '';
  if (u.status !== 'ok') u.status = 'contact';
  setRow('Users', u);
  return { ok: true, status: u.status };
}

/* ================= API застосунку ================= */

function handleApi(body) {
  var tgUser = checkInit(body.initData), id = String(tgUser.id), action = body.action || 'load';
  var u = findUser(id);
  if (action === 'register') return registerFromApp(tgUser, u, body);
  if (action === 'contact') return contactFromApp(tgUser, u, body);
  if (!u || u.status !== 'ok') return { error: 'NOT_REGISTERED' };
  if (action === 'room') { u.role = roleOf(u); return roomView(u, String(body.key || '')); }
  if (action === 'ping') return { online: onlineMark(id) };
  var fn = ACTIONS[action];
  if (!fn) throw new Error('Невідома дія');
  if (action === 'load') { u.role = roleOf(u); var d = buildD(u); d.online = onlineMark(id); return d; }
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    _cache = {};
    u = findUser(id); u.role = roleOf(u);
    if (fn.admin && u.role !== 'admin') throw new Error('Лише для адміністраторів');
    if (fn.leader && !has(u.role, ['leader', 'minister', 'admin'])) throw new Error('Лише для лідерів');
    var res = fn(u, body) || {};
    if (/^(event|settings)/.test(action)) CacheService.getScriptCache().put('pub', '', 1); // сторінка гостей одразу бачить зміни
    if (res.light) return res.light;
    _cache = {};
    var me = findUser(id); me.role = roleOf(me);
    var D = buildD(me);
    if (res.flash) D.flash = res.flash;
    return D;
  } finally { lock.releaseLock(); }
}

function txt(s, max) {
  s = String(s === undefined || s === null ? '' : s).replace(/\r/g, '').trim();
  return max ? s.slice(0, max) : s;
}
function needText(s, max, what) {
  var t = txt(s, max);
  if (!t) throw new Error('Заповніть поле «' + what + '»');
  return t;
}
function eventOut(e) {
  return {
    id: String(e.id), type: e.type === 'dates' ? 'dates' : 'weekly',
    dow: String(e.dow).split(',').filter(function (x) { return x !== ''; }).map(Number),
    dates: String(e.dates).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }),
    time: String(e.time), kind: KINDS.indexOf(e.kind) >= 0 ? e.kind : 'sunday',
    title: { uk: e.title_uk, ru: e.title_ru }, who: { uk: e.who_uk, ru: e.who_ru }, where: { uk: e.where_uk, ru: e.where_ru },
    desc: { uk: e.desc_uk, ru: e.desc_ru }, link: e.link, active: String(e.active) !== '0', order: Number(e.order) || 0
  };
}
function eventByKey(key) {
  var p = String(key).split('@');
  if (p.length !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(p[1])) return null;
  var e = findBy('Events', p[0]);
  return e ? { ev: eventOut(e), date: p[1] } : null;
}
function occursOn(ev, date) {
  if (ev.type === 'dates') return ev.dates.indexOf(date) >= 0;
  var d = startOf(date, '12:00');
  return ev.dow.indexOf(Number(Utilities.formatDate(d, TZ, 'u')) % 7) >= 0;
}

/* ---------- verses for HeavenOS cards ---------- */
function versesMap() {
  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('VERSES_SEEDED')) {
    var have = rows('CardVerses');
    Object.keys(VERSES_SEED).forEach(function (k) {
      if (have.some(function (r) { return Number(r.card) === Number(k); })) return;
      VERSES_SEED[k].forEach(function (v, i) { addRow('CardVerses', { id: newId(), card: String(k), ref: v.ref, text_uk: v.uk, text_ru: '', userId: '', who: v.who || '', created: String(Date.now() + i) }); });
    });
    P.setProperty('VERSES_SEEDED', '1');
  }
  var m = {};
  rows('CardVerses').map(function (r) { return r; }).sort(function (a, b) { return Number(a.created) - Number(b.created); }).forEach(function (r) {
    var n = Number(r.card); if (!n) return;
    (m[n] || (m[n] = [])).push({ id: String(r.id), ref: String(r.ref), uk: String(r.text_uk), ru: String(r.text_ru || ''), who: String(r.who || '') });
  });
  return m;
}

/* ---------- sermons: announce before Sunday, prepared summary after ---------- */
/** Відмітка часу в записі: «52:10» або «1:31:40». Порожнє дозволено. */
function clockTxt(v, what) {
  v = txt(v, 10);
  if (v && !/^(\d{1,2}:)?[0-5]?\d:[0-5]\d$/.test(v)) throw new Error(what + ': вкажіть час у форматі 52:10 або 1:31:40');
  return v;
}
function clockSecs(v) { return String(v).split(':').reduce(function (a, n) { return a * 60 + Number(n); }, 0); }
function sermonsOut() {
  return rows('Sermons').map(function (r) {
    return { id: String(r.id), date: String(r.date), time: String(r.time || ''), title: { uk: String(r.title_uk), ru: String(r.title_ru || r.title_uk) }, speaker: String(r.speaker || ''),
      verse: String(r.verse || ''), ask: String(r.ask || ''), text: String(r.text || ''), video: String(r.video || ''), vfrom: String(r.vfrom || ''), vto: String(r.vto || ''), status: r.status === 'published' ? 'published' : 'announce' };
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 40);
}

/* ---------- fellow travellers: anonymous counts and milestones only, never names or answers ---------- */
function wayBuild(users, myId) {
  var people = [], feed = [], monthAgo = Date.now() - 30 * 864e5, levels = [0, 0, 0, 0, 0, 0];
  users.forEach(function (x) {
    if (x.status !== 'ok') return;
    var pp = parseJ(x.personal, {});
    var P = (pp.devs && pp.devs.p) || {}, done = 0, kept = 0, cur = 0, started = 0, nm = '', uid = String(x.id);
    for (var n = 1; n <= 48; n++) {
      var p = P[n] || {};
      if (p.done) { done++; if (n % 8 === 0 && p.done > monthAgo) feed.push({ key: uid + ':lv' + (n / 8), uid: uid, name: nm, kind: 'level', v: n / 8, at: p.done }); }
      if (p.kept) kept++;
      if (!cur && !p.done) cur = n;
      if (!started && (p.took || p.done)) started = p.took || p.done;
    }
    if (!started) return;
    if (started > monthAgo) feed.push({ key: uid + ':start', uid: uid, name: nm, kind: 'start', v: 0, at: started });
    var kt = []; for (var m = 1; m <= 48; m++) if (P[m] && P[m].kept) kt.push(P[m].kept);
    kt.sort(function (a, b) { return a - b; });
    [5, 10, 20, 30, 48].forEach(function (k) { if (kt.length >= k && kt[k - 1] > monthAgo) feed.push({ key: uid + ':kept' + k, uid: uid, name: nm, kind: 'kept', v: k, at: kt[k - 1] }); });
    var lvl = Math.min(5, Math.floor(done / 8));
    levels[lvl]++;
    people.push({ uid: uid, name: nm, done: done, lvl: lvl, me: uid === myId });
  });
  var ch = {};
  rows('Cheers').forEach(function (c) { var o = ch[c.key] || (ch[c.key] = { n: 0, mine: {} }); o.n++; if (String(c.fromId) === myId) o.mine[c.kind] = true; });
  feed.sort(function (a, b) { return b.at - a.at; });
  feed = feed.slice(0, 25).map(function (f) { var o = ch[f.key] || { n: 0, mine: {} }; f.cheers = o.n; f.mine = o.mine; return f; });
  people.sort(function (a, b) { return b.done - a.done; });
  return { devs: { people: people.slice(0, 60), count: people.length, levels: levels }, feed: feed };
}

/* ---------- Церква в дії: «Бінго добрих справ», one 3×3 card a week for the whole church (cell 4 is the free star) ---------- */
var BG_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function weekKey() { var p = kyivDate().split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function bgMarks(r) { var m = String(r && r.marks || '').replace(/[^01]/g, ''); while (m.length < 9) m += '0'; return m.slice(0, 9); }
function bgHasLine(m) { return BG_LINES.some(function (l) { return l.every(function (i) { return i === 4 || m.charAt(i) === '1'; }); }); }
function bingoOut(myId) {
  var wk = weekKey(), out = { week: wk, mine: '000000000', cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], deeds: 0, people: 0, bingos: 0 };
  rows('Bingo').forEach(function (r) {
    if (String(r.week) !== wk) return;
    var m = bgMarks(r), n = 0;
    for (var i = 0; i < 9; i++) if (i !== 4 && m.charAt(i) === '1') { out.cells[i]++; n++; }
    if (!n) return;
    out.deeds += n; out.people++;
    if (bgHasLine(m)) out.bingos++;
    if (String(r.userId) === myId) out.mine = m;
  });
  return out;
}

function buildD(u) {
  var now = Date.now(), today = kyivDate(), myId = String(u.id), role = u.role;
  var isAdmin = role === 'admin', isLeader = has(role, ['leader', 'minister', 'admin']), isPrayer = has(role, ['prayer', 'minister', 'admin']);
  var users = rows('Users'), byId = {};
  users.forEach(function (x) { byId[String(x.id)] = x; });
  var nameOf = function (id) { var p = byId[String(id)]; return p ? p.name : ''; };

  var events = rows('Events').map(eventOut).sort(function (a, b) { return a.order - b.order; });

  var att = {}, leader = {};
  rows('Going').forEach(function (g) {
    var d = String(g.key).split('@')[1];
    if (!d || d < today) return;
    var a = att[g.key] || (att[g.key] = { n: 0, names: [], mine: false });
    if (String(g.userId) === myId) a.mine = true;
    else { a.n++; if (a.names.length < 6) a.names.push(first(nameOf(g.userId)) || '?'); }
    if (isLeader) {
      var p = byId[String(g.userId)];
      (leader[g.key] || (leader[g.key] = [])).push({ id: String(g.userId), name: p ? p.name : '?', phone: p ? String(p.phone) : '', username: p ? String(p.username) : '', present: String(g.present) === '1' });
    }
  });

  var weekAgo = now - 7 * 864e5, lit = 0, needs = [];
  rows('Needs').forEach(function (n) {
    var pr = parseJ(n.prayers, []), mine = String(n.userId) === myId, created = Number(n.created) || 0;
    pr.forEach(function (p) { if (p[1] > weekAgo) lit++; });
    if (n.status === 'hidden') return;
    if (n.vis === 'team' && !mine && !isPrayer) return;
    if (!mine && now - created > 60 * 864e5) return;
    needs.push({
      id: String(n.id), text: n.text, who: n.vis === 'anon' ? '' : first(nameOf(n.userId)), vis: n.vis, n: pr.length,
      prayed: pr.some(function (p) { return String(p[0]) === myId; }), mine: mine, answered: n.status === 'answered', created: created
    });
  });
  needs.sort(function (a, b) { return b.created - a.created; });
  lit += quietLit(now);

  var tests = [], myTests = [];
  rows('Tests').forEach(function (t) {
    var mine = String(t.userId) === myId;
    if (mine) myTests.push({ id: String(t.id), text: t.text, sign: t.sign, status: t.status });
    if (t.status === 'approved') tests.push({ id: String(t.id), text: t.text, who: t.sign === 'anon' ? '' : first(nameOf(t.userId)), created: Number(t.created) || 0 });
  });
  tests.sort(function (a, b) { return b.created - a.created; });

  var ads = [], myAds = [];
  rows('Ads').forEach(function (a) {
    var mine = String(a.userId) === myId, created = Number(a.created) || 0, fresh = now - created < 30 * 864e5;
    if (mine && a.status !== 'archived') myAds.push({ id: String(a.id), type: a.type, text: a.text, area: a.area, status: fresh ? a.status : 'expired' });
    if (a.status === 'active' && fresh && !mine) {
      var p = byId[String(a.userId)];
      ads.push({ id: String(a.id), type: a.type, text: a.text, area: a.area, who: first(p && p.name), username: p ? String(p.username) : '', uid: String(a.userId), created: created });
    }
  });
  ads.sort(function (a, b) { return b.created - a.created; });

  var D = {
    me: { id: myId, name: u.name, role: role, phone: String(u.phone) },
    settings: settingsAll(), events: events, att: att, needs: needs, lit: lit,
    tests: tests.slice(0, 60), myTests: myTests, ads: ads.slice(0, 80), myAds: myAds,
    personal: parseJ(u.personal, {}), leader: isLeader ? leader : null, calls: isLeader ? callLinks() : null, admin: null, today: today
  };
  D.rooms = roomsList(myId, today);
  D.verses = versesMap();
  D.sermons = sermonsOut();
  D.way = wayBuild(users, myId);
  D.bingo = bingoOut(myId);

  if (isAdmin) {
    var pendingTests = [], pendingAds = [], activeNeeds = [];
    rows('Tests').forEach(function (t) { if (t.status === 'pending') pendingTests.push({ id: String(t.id), text: t.text, sign: t.sign, who: nameOf(t.userId), created: Number(t.created) || 0 }); });
    rows('Ads').forEach(function (a) { if (a.status === 'pending') pendingAds.push({ id: String(a.id), type: a.type, text: a.text, area: a.area, who: nameOf(a.userId), created: Number(a.created) || 0 }); });
    rows('Needs').forEach(function (n) { if (n.status !== 'hidden' && now - (Number(n.created) || 0) < 60 * 864e5) activeNeeds.push({ id: String(n.id), text: n.text, vis: n.vis, who: nameOf(n.userId), created: Number(n.created) || 0 }); });
    var reqs = rows('Requests').map(function (r) {
      var p = byId[String(r.userId)];
      return { id: String(r.id), kind: r.kind, topic: r.topic, contact: r.contact, status: r.status, created: Number(r.created) || 0, who: p ? p.name : '?', phone: p ? String(p.phone) : '', username: p ? String(p.username) : '' };
    }).sort(function (a, b) { return (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.created - a.created; }).slice(0, 150);
    var people = users.filter(function (x) { return x.status === 'ok'; }).map(function (x) {
      var pp = parseJ(x.personal, {});
      return { id: String(x.id), name: x.name, phone: String(x.phone), username: String(x.username), role: roleOf(x), created: Number(x.created) || 0, src: String(x.src || ''),
        skills: Object.keys(pp.skills || {}), serve: Object.keys(pp.serve || {}), verseOn: !!pp.verseOn };
    }).sort(function (a, b) { return b.created - a.created; });
    D.admin = {
      tests: pendingTests, ads: pendingAds, needs: activeNeeds.sort(function (a, b) { return b.created - a.created; }).slice(0, 80),
      requests: reqs, users: people, stats: { users: people.length, week: lit, newRequests: reqs.filter(function (r) { return r.status === 'new'; }).length }
    };
  }
  return D;
}

var ACTIONS = {
  load: function () {},

  personal: function (u, b) {
    var p = b.personal && typeof b.personal === 'object' ? b.personal : {};
    var s = JSON.stringify(p);
    if (s.length > 45000) throw new Error('Забагато нотаток для збереження. Видаліть частину старих');
    u.personal = s; u.lang = p.lang === 'ru' || p.lang === 'en' ? p.lang : 'uk'; u.seen = String(Date.now());
    setRow('Users', u);
    return { light: { ok: true } };
  },

  profile: function (u, b) {
    u.name = needText(b.name, 60, 'Ім’я').replace(/\s+/g, ' ');
    setRow('Users', u);
  },

  going: function (u, b) {
    var x = eventByKey(b.key);
    if (!x || !occursOn(x.ev, x.date)) throw new Error('Такої зустрічі немає в розкладі');
    var mine = rows('Going').filter(function (g) { return g.key === b.key && String(g.userId) === String(u.id); });
    if (b.on && !mine.length) addRow('Going', { key: b.key, userId: u.id, at: Date.now(), present: '', reminded: '' });
    if (!b.on && mine.length) delRows('Going', mine);
  },

  pray: function (u, b) {
    var n = findBy('Needs', b.id);
    if (!n) throw new Error('Потребу не знайдено');
    var pr = parseJ(n.prayers, []).filter(function (p) { return String(p[0]) !== String(u.id); });
    if (b.on) pr.push([String(u.id), Date.now()]);
    n.prayers = JSON.stringify(pr);
    setRow('Needs', n);
  },

  needNew: function (u, b) {
    var vis = ['all', 'anon', 'team'].indexOf(b.vis) >= 0 ? b.vis : 'all';
    var text = needText(b.text, 500, 'Про що молитися');
    addRow('Needs', { id: newId(), userId: u.id, text: text, vis: vis, status: 'active', created: Date.now(), prayers: '[]' });
    notifyRoles(['prayer', 'minister'], '🙏 Нова молитовна потреба' + (vis === 'anon' ? ' (анонімно)' : ' від ' + u.name) + ':\n\n' + text);
  },

  prayQuiet: function (u, b) {
    var k = Math.max(0, Math.min(10, Math.floor(Number(b.count) || 0))), day = kyivDate(), c = CacheService.getScriptCache(), ck = 'ql:' + u.id + ':' + day;
    var used = Number(c.get(ck)) || 0; k = Math.min(k, 30 - used); // не більше 30 на людину за день
    if (k > 0) {
      c.put(ck, String(used + k), 86400);
      var props = PropertiesService.getScriptProperties(), pk = 'qlit:' + day;
      props.setProperty(pk, String((Number(props.getProperty(pk)) || 0) + k));
      var old = 'qlit:' + kyivDate(new Date(Date.now() - 14 * 864e5)); if (props.getProperty(old)) props.deleteProperty(old);
    }
    return { light: { ok: true, added: Math.max(0, k) } };
  },

  needAnswered: function (u, b) {
    var n = findBy('Needs', b.id);
    if (!n || String(n.userId) !== String(u.id)) throw new Error('Потребу не знайдено');
    var was = n.status === 'answered';
    n.status = 'answered'; setRow('Needs', n);
    if (!was) answeredNotify(n);
  },

  needDel: function (u, b) {
    var n = findBy('Needs', b.id);
    if (!n || (String(n.userId) !== String(u.id) && u.role !== 'admin')) throw new Error('Потребу не знайдено');
    delRows('Needs', [n]);
  },

  testNew: function (u, b) {
    if (!b.consent) throw new Error('Потрібна згода на публікацію');
    var text = needText(b.text, 1500, 'Що зробив Бог');
    addRow('Tests', { id: newId(), userId: u.id, text: text, sign: b.sign === 'anon' ? 'anon' : 'name', status: 'pending', created: Date.now(), needId: txt(b.needId, 20) });
    if (b.needId) {
      var n = findBy('Needs', b.needId);
      if (n && String(n.userId) === String(u.id) && n.status !== 'answered') { n.status = 'answered'; setRow('Needs', n); answeredNotify(n); }
    }
    notifyRoles(['admin'], '✨ Нове свідчення на модерацію від ' + u.name + '. Відкрийте застосунок → Ще → Адмінка → Модерація.');
  },

  testDel: function (u, b) {
    var t = findBy('Tests', b.id);
    if (!t || (String(t.userId) !== String(u.id) && u.role !== 'admin')) throw new Error('Свідчення не знайдено');
    delRows('Tests', [t]);
  },

  adNew: function (u, b) {
    var type = ['give', 'need', 'sell', 'seek'].indexOf(b.type) >= 0 ? b.type : 'give';
    addRow('Ads', { id: newId(), userId: u.id, type: type, text: needText(b.text, 400, 'Що саме'), area: txt(b.area, 40), status: u.role === 'admin' ? 'active' : 'pending', created: Date.now() });
    if (u.role !== 'admin') notifyRoles(['admin'], '📌 Нове оголошення на модерацію від ' + u.name + '.');
  },

  adDel: function (u, b) {
    var a = findBy('Ads', b.id);
    if (!a || (String(a.userId) !== String(u.id) && u.role !== 'admin')) throw new Error('Оголошення не знайдено');
    delRows('Ads', [a]);
  },

  request: function (u, b) {
    var kind = ['pastoral', 'serve', 'hello'].indexOf(b.kind) >= 0 ? b.kind : 'pastoral';
    var topic = txt(b.topic, 200), contact = txt(b.contact, 60);
    addRow('Requests', { id: newId(), userId: u.id, kind: kind, topic: topic, contact: contact, status: 'new', created: Date.now() });
    var who = u.name + ', ' + u.phone + (u.username ? ', @' + u.username : '');
    if (kind === 'pastoral') notifyRoles(['minister', 'admin'], '🕊 Заявка на розмову з пастором\n' + who + '\nТема: ' + topic + '\nЗв’язок: ' + contact);
    if (kind === 'serve') notifyRoles(['admin'], '🙌 Хоче служити: ' + who + '\nКоманда: ' + topic);
    if (kind === 'hello') notifyRoles(['minister', 'admin'], '👋 Новенький хоче познайомитися: ' + who);
  },

  requestCancel: function (u, b) {
    var mine = rows('Requests').filter(function (r) { return String(r.userId) === String(u.id) && r.kind === b.kind && r.status === 'new' && (!b.topic || r.topic === b.topic); });
    if (mine.length) delRows('Requests', mine);
  },

  /** Пост для групи церкви: картинка, кілька рядків і кнопки. Адмін пересилає його в групу й закріплює (кнопки при пересиланні лишаються). */
  promoPost: function (u, b) {
    var l = b.lang === 'ru' || b.lang === 'en' ? b.lang : 'uk', base = 'https://mistosvitla.github.io/app/' + (l === 'uk' ? '' : l + '/');
    var T = {
      uk: { cap: '<b>Місто Світла тепер у Telegram</b> ✨\n\nРозклад зустрічей, Біблія з планом читання, молитва разом і бінго добрих справ — усе в одному місці.\n\nВідкривається в один дотик, нічого встановлювати не треба 👇', open: '✨ Відкрити застосунок', share: '💛 Поділитися з другом', st: 'Застосунок нашої церкви «Місто Світла» в Telegram 👇' },
      ru: { cap: '<b>Місто Світла теперь в Telegram</b> ✨\n\nРасписание встреч, Библия с планом чтения, молитва вместе и бинго добрых дел — всё в одном месте.\n\nОткрывается в одно касание, ничего устанавливать не нужно 👇', open: '✨ Открыть приложение', share: '💛 Поделиться с другом', st: 'Приложение нашей церкви «Місто Світла» в Telegram 👇' },
      en: { cap: '<b>Misto Svitla is now in Telegram</b> ✨\n\nMeeting times, a Bible reading plan, praying together and a good deeds bingo — all in one place.\n\nOpens in one tap, nothing to install 👇', open: '✨ Open the app', share: '💛 Share with a friend', st: 'Our church app «Misto Svitla» in Telegram 👇' }
    }[l];
    var kb = { inline_keyboard: [[{ text: T.open, url: 'https://t.me/' + botName() + '?startapp=src_group' }], [{ text: T.share, url: 'https://t.me/share/url?url=' + encodeURIComponent(base) + '&text=' + encodeURIComponent(T.st) }]] };
    var r = tgCall('sendPhoto', { chat_id: String(u.id), photo: base + 'og.jpg', caption: T.cap, parse_mode: 'HTML', reply_markup: kb });
    if (!r || !r.ok) throw new Error('Telegram не прийняв пост');
    return { light: { ok: true } };
  },
  sendImage: function (u, b) {
    var m = String(b.img || '').match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!m) throw new Error('Не вдалося підготувати картинку');
    var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], 'verse.' + (m[1] === 'png' ? 'png' : 'jpg'));
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('BOT_TOKEN') + '/sendPhoto', { method: 'post', payload: { chat_id: String(u.id), photo: blob, caption: txt(b.caption, 900) }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('Telegram не прийняв картинку');
    return { light: { ok: true } };
  },

  presence: function (u, b) {
    var g = rows('Going').filter(function (x) { return x.key === b.key && String(x.userId) === String(b.userId); })[0];
    if (!g) throw new Error('Людину не знайдено у списку');
    g.present = b.on ? '1' : ''; setRow('Going', g);
  },

  eventSave: function (u, b) {
    var e = b.event || {}, id = txt(e.id, 30) || ('e' + newId());
    var type = e.type === 'dates' ? 'dates' : 'weekly';
    var time = txt(e.time, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Вкажіть час у форматі 18:00');
    var dow = (e.dow || []).map(Number).filter(function (d) { return d >= 0 && d <= 6; });
    var dates = (e.dates || []).map(function (d) { return txt(d, 10); }).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
    if (type === 'weekly' && !dow.length) throw new Error('Оберіть хоча б один день тижня');
    if (type === 'dates' && !dates.length) throw new Error('Додайте хоча б одну дату');
    var o = findBy('Events', id) || { _new: true, order: String(rows('Events').length + 1) };
    o.id = id; o.type = type; o.dow = dow.join(','); o.dates = dates.join(','); o.time = time;
    o.kind = KINDS.indexOf(e.kind) >= 0 ? e.kind : 'sunday';
    var t = e.title || {}, w = e.who || {}, p = e.where || {}, d = e.desc || {};
    o.title_uk = needText(t.uk, 80, 'Назва'); o.title_ru = txt(t.ru, 80) || o.title_uk;
    o.who_uk = txt(w.uk, 80); o.who_ru = txt(w.ru, 80) || o.who_uk;
    o.where_uk = txt(p.uk, 120); o.where_ru = txt(p.ru, 120) || o.where_uk;
    o.desc_uk = txt(d.uk, 600); o.desc_ru = txt(d.ru, 600) || o.desc_uk;
    o.link = /^https?:\/\//.test(txt(e.link)) ? txt(e.link, 300) : '';
    o.active = e.active === false ? '0' : '1';
    if (o._new) addRow('Events', o); else setRow('Events', o);
    return { flash: { saved: id } };
  },
  verseAdd: function (u, b) {
    var n = Number(b.card), list = (b.verses || []).slice(0, 20), now = Date.now(), have = rows('CardVerses').filter(function (r) { return Number(r.card) === n; }).length;
    if (!(n >= 1 && n <= 60)) throw new Error('Невідома картка');
    if (!list.length) throw new Error('Додайте хоча б один вірш');
    if (have + list.length > 30) throw new Error('До картки можна додати до 30 віршів');
    list.forEach(function (v, i) {
      addRow('CardVerses', { id: newId(), card: String(n), ref: needText(v.ref, 40, 'Місце Писання'), text_uk: txt(v.uk, 900), text_ru: txt(v.ru, 900), userId: String(u.id), who: first(u.name), created: String(now + i) });
    });
  },
  verseDel: function (u, b) {
    var r = findBy('CardVerses', b.id);
    if (!r) throw new Error('Вірш не знайдено');
    delRows('CardVerses', [r]);
  },
  sermonSave: function (u, b) {
    var s = b.sermon || {}, id = txt(s.id, 30) || ('s' + newId());
    var date = txt(s.date, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Вкажіть дату проповіді');
    var time = txt(s.time, 5); if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Вкажіть час у форматі 11:00');
    var o = findBy('Sermons', id) || { _new: true, created: String(Date.now()) };
    o.id = id; o.date = date; o.time = time || '11:00';
    o.title_uk = needText(s.title_uk, 120, 'Тема'); o.title_ru = txt(s.title_ru, 120) || o.title_uk;
    o.speaker = txt(s.speaker, 80); o.verse = txt(s.verse, 80); o.ask = txt(s.ask, 600); o.text = txt(s.text, 8000);
    o.video = txt(s.video, 300); if (o.video && !/^https:\/\/\S+$/.test(o.video)) throw new Error('Посилання на відео має починатися з https://');
    o.vfrom = clockTxt(s.vfrom, 'Початок'); o.vto = clockTxt(s.vto, 'Кінець');
    if (o.vfrom && o.vto && clockSecs(o.vto) <= clockSecs(o.vfrom)) throw new Error('Кінець проповіді має бути пізніше за початок');
    o.status = s.status === 'published' ? 'published' : 'announce';
    if (o.status === 'published' && !o.text) throw new Error('Додайте текст підсумку, щоб опублікувати');
    if (o._new) addRow('Sermons', o); else setRow('Sermons', o);
    return { flash: { sermon: id } };
  },
  sermonDel: function (u, b) {
    var r = findBy('Sermons', b.id);
    if (!r) throw new Error('Проповідь не знайдено');
    delRows('Sermons', [r]);
  },
  cheer: function (u, b) {
    var key = txt(b.key, 60), kind = b.kind === 'pray' ? 'pray' : 'cheer', to = key.split(':')[0];
    if (!key || !to) throw new Error('Невідома подія');
    if (to === String(u.id)) throw new Error('Себе підтримувати не треба, ти й так молодець');
    var mine = rows('Cheers').filter(function (c) { return c.key === key && String(c.fromId) === String(u.id) && c.kind === kind; });
    if (mine.length) { delRows('Cheers', mine); return; }
    addRow('Cheers', { key: key, fromId: String(u.id), toId: to, kind: kind, at: String(Date.now()) });
    var t = findUser(to);
    if (t) send(to, kind === 'pray' ? '🙏 ' + first(u.name) + ' молиться за тебе на шляху Mind DEVS.' : '🔥 ' + first(u.name) + ' підтримує тебе на шляху Mind DEVS. Так тримати!');
  },
  bgSend: function (u, b) {
    var m = String(b.marks || '');
    if (!/^[01]{9}$/.test(m)) throw new Error('Невідома картка');
    m = m.slice(0, 4) + '0' + m.slice(5);
    var wk = weekKey(), key = wk + ':' + u.id, r = rows('Bingo').filter(function (q) { return String(q.key) === key; })[0];
    if (!r) addRow('Bingo', { key: key, week: wk, userId: String(u.id), marks: m, at: String(Date.now()) });
    else { r.marks = m; r.at = String(Date.now()); setRow('Bingo', r); }
  },
  eventDel: function (u, b) {
    var e = findBy('Events', b.id);
    if (!e) throw new Error('Подію не знайдено');
    var gone = rows('Going').filter(function (g) { return String(g.key).split('@')[0] === String(e.id); });
    delRows('Events', [e]);
    if (gone.length) delRows('Going', gone);
  },
  settingsSave: function (u, b) {
    var s = b.settings || {}, all = rows('Settings'), k;
    for (k in s) {
      if (!(k in SETTINGS_DEFAULT)) continue;
      var v = txt(s[k], 3000);
      if (k === 'verseTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('Час вірша вкажіть у форматі 07:30');
      if (k === 'ytChannel' && v && !/^UC[\w-]{22}$/.test(v)) throw new Error('ID каналу YouTube має починатися з UC і мати 24 символи');
      if (k === 'monoJar' && v && !/^https:\/\/send\.monobank\.ua\//.test(v)) throw new Error('Посилання на банку має починатися з https://send.monobank.ua/');
      if (k === 'cardStart' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Дату старту карток вкажіть як 2026-11-09');
      var r = all.filter(function (x) { return x.key === k; })[0];
      if (r) { r.value = v; setRow('Settings', r); } else addRow('Settings', { key: k, value: v });
    }
  },
  moderate: function (u, b) {
    var map = { test: 'Tests', ad: 'Ads', need: 'Needs' }, name = map[b.kind];
    var o = name && findBy(name, b.id);
    if (!o) throw new Error('Запис не знайдено');
    var ok = { test: ['approved', 'rejected'], ad: ['active', 'rejected'], need: ['hidden', 'active'] }[b.kind];
    if (ok.indexOf(b.status) < 0) throw new Error('Невідомий статус');
    o.status = b.status; setRow(name, o);
    if (b.kind === 'test' && b.status === 'approved') send(o.userId, '✨ Твоє свідчення опубліковано на стіні в застосунку. Дякуємо, що поділився!');
    if (b.kind === 'ad' && b.status === 'active') send(o.userId, '📌 Твоє оголошення опубліковано. Воно буде активне 30 днів.');
  },
  role: function (u, b) {
    var x = findUser(b.userId);
    if (!x) throw new Error('Людину не знайдено');
    if (ROLES.indexOf(b.role) < 0) throw new Error('Невідома роль');
    x.role = b.role; setRow('Users', x);
  },
  roleInvite: function (u, b) {
    if (INVITE_ROLES.indexOf(b.role) < 0) throw new Error('Невідома роль');
    var k = 'INV_' + b.role, code = prop(k);
    if (!code || b.reset) { code = newId().toLowerCase(); PropertiesService.getScriptProperties().setProperty(k, code); }
    return { light: { role: b.role, link: 'https://t.me/' + botName() + '?start=r_' + b.role + '_' + code } };
  },
  requestDone: function (u, b) {
    var r = findBy('Requests', b.id);
    if (!r) throw new Error('Заявку не знайдено');
    r.status = r.status === 'done' ? 'new' : 'done'; setRow('Requests', r);
  },
  broadcast: function (u, b) {
    var text = needText(b.text, 3500, 'Текст розсилки');
    var to = rows('Users').filter(function (x) { return x.status === 'ok'; });
    var n = sendMany(to.map(function (x) { return { chat_id: String(x.id), text: text, reply_markup: appButton(T[langOf(x)].open) }; }));
    return { flash: { sent: n } };
  }
};

/* ================= жива домашня група (кімната) =================
 * Лідер відкриває кімнату для конкретної зустрічі HeavenOS (ключ "подія@дата"), обирає картку тижня й етап.
 * Учасники онлайн приєднуються, пишуть думки, молитовні потреби, свої кроки, ставлять реакції, «піднімають руку».
 * Опитування стану ("room") іде без блокування і читає кеш, тож сервер витримує десятки людей онлайн. */
var ROOM_STAGES = ['welcome', 'worship', 'card', 'talk', 'prayer', 'step'];
var ROOM_TYPES = ['msg', 'pray', 'step', 'hand', 'comment'];
var ROOM_REACTS = ['amen', 'heart', 'fire', 'light'];

function roomRow(key) { return rows('Rooms').filter(function (r) { return String(r.key) === String(key); })[0] || null; }
function roomCache() { return CacheService.getScriptCache(); }
function roomBuild(key) {
  var r = roomRow(key); if (!r) return null;
  var x = eventByKey(key), byId = {};
  rows('Users').forEach(function (p) { byId[String(p.id)] = p; });
  var nm = function (id) { var p = byId[String(id)]; return p ? first(p.name) : '?'; };
  var feed = rows('RoomFeed').filter(function (f) { return String(f.key) === String(key); }).map(function (f) {
    return { id: String(f.id), t: f.type, u: String(f.userId), n: nm(f.userId), x: String(f.text), at: Number(f.at) || 0, e: parseJ(f.extra, null) };
  }).sort(function (a, b) { return a.at - b.at; });
  var joined = {};
  feed.forEach(function (f) { if (f.t === 'join') joined[f.u] = f.n; });
  return {
    key: String(key), status: String(r.status), card: Number(r.card) || 1, link: String(r.link || ''), stage: String(r.stage || 'welcome'), pin: String(r.pin || ''),
    leaderId: String(r.leaderId), leader: nm(r.leaderId), opened: Number(r.opened) || 0, closed: Number(r.closed) || 0,
    reacts: parseJ(r.reacts, {}), summary: parseJ(r.summary, null), hands: parseJ(r.hands, []),
    title: x ? x.ev.title : { uk: 'HeavenOS', ru: 'HeavenOS' }, who: x ? x.ev.who : { uk: '', ru: '' }, time: x ? x.ev.time : '', date: x ? x.date : '',
    joined: joined, feed: feed.filter(function (f) { return f.t !== 'join'; }).slice(-150)
  };
}
function roomState(key) {
  var c = roomCache(), s = c.get('R:' + key);
  if (s) return parseJ(s, null);
  var st = roomBuild(key);
  if (st) roomPut(st);
  return st;
}
function roomPut(st) { try { roomCache().put('R:' + st.key, JSON.stringify(st), 1800); } catch (e) { roomCache().remove && roomCache().remove('R:' + st.key); } }
function roomOnline(st, uid) {
  var c = roomCache(), now = Date.now(), ids = Object.keys(st.joined || {});
  if (uid) c.put('P:' + st.key + ':' + uid, String(now), 60);
  var got = c.getAll ? c.getAll(ids.map(function (i) { return 'P:' + st.key + ':' + i; })) : null, on = [];
  ids.forEach(function (i) { var v = got ? got['P:' + st.key + ':' + i] : c.get('P:' + st.key + ':' + i); if (v && now - Number(v) < 45000) on.push(st.joined[i]); });
  return on;
}
function roomView(u, key) {
  var st = roomState(key);
  if (!st) return { room: null };
  var uid = String(u.id), isLeader = has(u.role, ['leader', 'minister', 'admin']);
  var on = st.status === 'live' ? roomOnline(st, st.joined[uid] ? uid : '') : [];
  var feed = st.feed.map(function (f) {
    var o = { id: f.id, t: f.t, n: f.n, x: f.x, at: f.at, mine: f.u === uid };
    if (f.t === 'pray') { var pr = (f.e && f.e.p) || []; o.c = pr.length; o.prayed = pr.indexOf(uid) >= 0; }
    return o;
  });
  return { room: {
    key: st.key, status: st.status, card: st.card, link: st.link, stage: st.stage, pin: st.pin, leader: st.leader, mineLeader: st.leaderId === uid,
    reacts: st.reacts, summary: st.summary, title: st.title, who: st.who, time: st.time, date: st.date, opened: st.opened, closed: st.closed,
    joined: !!st.joined[uid], online: on, onlineN: on.length, joinedN: Object.keys(st.joined).length,
    hands: isLeader ? st.hands.map(function (h) { return { id: h, n: st.joined[h] || '?' }; }) : [], handUp: st.hands.indexOf(uid) >= 0,
    feed: feed, canLead: isLeader
  } };
}
function roomsList(myId, today) {
  var lim = Utilities.formatDate(new Date(Date.now() - 35 * 864e5), TZ, 'yyyy-MM-dd'), out = [];
  rows('Rooms').forEach(function (r) {
    var d = String(r.key).split('@')[1]; if (!d || d < lim) return;
    var x = eventByKey(r.key), sm = parseJ(r.summary, null);
    var st = roomCache().get('R:' + r.key), joined = 0, mine = false;
    if (st) { var o = parseJ(st, {}); joined = Object.keys(o.joined || {}).length; mine = !!(o.joined || {})[myId]; }
    out.push({ key: String(r.key), status: String(r.status), card: Number(r.card) || 1, date: d, title: x ? x.ev.title : null, who: x ? x.ev.who : null,
      time: x ? x.ev.time : '', joinedN: sm ? sm.online : joined, mine: mine, summary: sm });
  });
  return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}
function roomLive(key) {
  var st = roomState(key);
  if (!st) throw new Error('Кімнату ще не відкрито');
  return st;
}
function roomAdd(st, u, type, text, extra) {
  var id = 'f' + newId(), at = Date.now();
  addRow('RoomFeed', { id: id, key: st.key, userId: u.id, type: type, text: text, at: at, extra: extra ? JSON.stringify(extra) : '' });
  var item = { id: id, t: type, u: String(u.id), n: first(u.name), x: text, at: at, e: extra || null };
  if (type === 'join') st.joined[String(u.id)] = first(u.name); else { st.feed.push(item); if (st.feed.length > 150) st.feed = st.feed.slice(-150); }
  return item;
}
function roomSaveRow(st, patch) {
  var r = roomRow(st.key); if (!r) return;
  for (var k in patch) r[k] = patch[k];
  setRow('Rooms', r);
}
function roomSlow(u) {
  var c = roomCache(), k = 'S:' + u.id, last = Number(c.get(k) || 0), now = Date.now();
  if (now - last < 2500) throw new Error('Трохи повільніше, будь ласка');
  c.put(k, String(now), 30);
}

ACTIONS.roleInvite.admin = true;
ACTIONS.promoPost.admin = true;
/** Посилання на дзвінок для кожної групи (за id події), щоб лідер не вставляв його щотижня. */
function callOf(evId) { return prop('call:' + evId); }
function callSave(evId, link) { PropertiesService.getScriptProperties().setProperty('call:' + evId, link); }
function callLinks() {
  var o = {};
  rows('Events').forEach(function (e) { if (e.kind === 'heaven') { var l = callOf(String(e.id)); if (l) o[String(e.id)] = l; } });
  return o;
}
ACTIONS.roomOpen = function (u, b) {
  var x = eventByKey(b.key);
  if (!x || x.ev.kind !== 'heaven' || !occursOn(x.ev, x.date)) throw new Error('Оберіть зустріч HeavenOS з розкладу');
  var card = Math.max(1, Math.min(36, Number(b.card) || 1));
  var link = /^https?:\/\//.test(txt(b.link)) ? txt(b.link, 300) : '';
  if (link) callSave(x.ev.id, link); else link = callOf(x.ev.id); // посилання групи запам’ятовується: наступного разу підставиться саме
  var r = roomRow(b.key), now = Date.now(), first_ = !r;
  if (!r) addRow('Rooms', { key: b.key, status: 'live', card: card, link: link, stage: 'welcome', pin: '', leaderId: u.id, opened: now, closed: '', reacts: '{}', summary: '', hands: '[]' });
  else { r.status = 'live'; r.card = card; r.link = link; r.leaderId = u.id; if (!r.opened) r.opened = now; r.closed = ''; r.summary = ''; setRow('Rooms', r); }
  _cache = {};
  var st = roomBuild(b.key);
  if (!st.joined[String(u.id)]) roomAdd(st, u, 'join', '');
  roomPut(st);
  if (first_ && b.notify !== false) roomNotify(b.key, x, u);
  return { flash: { room: b.key } };
};
ACTIONS.roomOpen.leader = true;

function roomNotify(key, x, u) {
  var ids = {}, lim = Date.now() - 60 * 864e5;
  rows('Going').forEach(function (g) { if (g.key === key) ids[String(g.userId)] = 1; });
  rows('RoomFeed').forEach(function (f) { if (f.type === 'join' && String(f.key).split('@')[0] === x.ev.id && Number(f.at) > lim) ids[String(f.userId)] = 1; });
  delete ids[String(u.id)];
  var list = rows('Users').filter(function (p) { return p.status === 'ok' && ids[String(p.id)]; }).map(function (p) {
    var t = T[langOf(p)];
    return { chat_id: String(p.id), text: t.roomLive, reply_markup: appButton(t.join, prop('APP_URL') + '#room=' + encodeURIComponent(key)) };
  });
  if (list.length) sendMany(list);
}

ACTIONS.roomJoin = function (u, b) {
  var st = roomLive(b.key);
  if (!st.joined[String(u.id)]) { roomAdd(st, u, 'join', ''); roomPut(st); }
  return { light: roomView(u, b.key) };
};
ACTIONS.roomPost = function (u, b) {
  var st = roomLive(b.key), type = ROOM_TYPES.indexOf(b.type) >= 0 ? b.type : 'msg';
  if (st.status !== 'live' && type !== 'comment') throw new Error('Зустріч завершено. Можна залишити коментар');
  roomSlow(u);
  if (!st.joined[String(u.id)]) roomAdd(st, u, 'join', '');
  if (type === 'hand') {
    if (st.hands.indexOf(String(u.id)) < 0) st.hands.push(String(u.id));
    roomSaveRow(st, { hands: JSON.stringify(st.hands) });
    roomAdd(st, u, 'hand', '');
  } else {
    var t = needText(b.text, 400, type === 'pray' ? 'Молитовна потреба' : 'Повідомлення');
    roomAdd(st, u, type, t, type === 'pray' ? { p: [] } : null);
  }
  roomPut(st);
  return { light: roomView(u, b.key) };
};
ACTIONS.roomPray = function (u, b) {
  var st = roomLive(b.key), f = st.feed.filter(function (q) { return q.id === b.id && q.t === 'pray'; })[0];
  if (!f) throw new Error('Потребу не знайдено');
  var p = (f.e && f.e.p) || [], i = p.indexOf(String(u.id));
  if (i < 0) p.push(String(u.id)); else p.splice(i, 1);
  f.e = { p: p };
  var row = rows('RoomFeed').filter(function (q) { return q.id === b.id; })[0];
  if (row) { row.extra = JSON.stringify(f.e); setRow('RoomFeed', row); }
  roomPut(st);
  return { light: roomView(u, b.key) };
};
ACTIONS.roomReact = function (u, b) {
  var st = roomLive(b.key), k = ROOM_REACTS.indexOf(b.kind) >= 0 ? b.kind : 'amen';
  var c = roomCache(), rk = 'Q:' + st.key + ':' + u.id + ':' + k;
  if (c.get(rk)) return { light: roomView(u, b.key) };
  c.put(rk, '1', 3);
  st.reacts[k] = (Number(st.reacts[k]) || 0) + 1;
  roomSaveRow(st, { reacts: JSON.stringify(st.reacts) });
  roomPut(st);
  return { light: roomView(u, b.key) };
};
ACTIONS.roomDel = function (u, b) {
  var st = roomLive(b.key), isLeader = has(u.role, ['leader', 'minister', 'admin']);
  var f = st.feed.filter(function (q) { return q.id === b.id; })[0];
  if (!f) throw new Error('Повідомлення не знайдено');
  if (f.u !== String(u.id) && !isLeader) throw new Error('Можна видалити лише своє');
  st.feed = st.feed.filter(function (q) { return q.id !== b.id; });
  delRows('RoomFeed', rows('RoomFeed').filter(function (q) { return q.id === b.id; }));
  roomPut(st);
  return { light: roomView(u, b.key) };
};
ACTIONS.roomSet = function (u, b) {
  var st = roomLive(b.key), patch = {};
  if (st.status !== 'live') throw new Error('Зустріч уже завершено');
  if (b.stage !== undefined) { if (ROOM_STAGES.indexOf(b.stage) < 0) throw new Error('Невідомий етап'); st.stage = patch.stage = b.stage; }
  if (b.pin !== undefined) { st.pin = patch.pin = txt(b.pin, 300); if (st.pin) roomAdd(st, u, 'pin', st.pin); }
  if (b.card !== undefined) { st.card = patch.card = Math.max(1, Math.min(36, Number(b.card) || 1)); }
  if (b.link !== undefined) { st.link = patch.link = /^https?:\/\//.test(txt(b.link)) ? txt(b.link, 300) : ''; if (st.link) callSave(String(st.key).split('@')[0], st.link); }
  if (b.handDone !== undefined) { st.hands = st.hands.filter(function (h) { return h !== String(b.handDone); }); patch.hands = JSON.stringify(st.hands); }
  roomSaveRow(st, patch);
  roomPut(st);
  return { light: roomView(u, b.key) };
};
ACTIONS.roomSet.leader = true;
ACTIONS.roomClose = function (u, b) {
  var st = roomLive(b.key);
  var going = rows('Going').filter(function (g) { return g.key === st.key; });
  var cnt = function (t) { return st.feed.filter(function (f) { return f.t === t; }).length; };
  var reacts = 0; for (var k in st.reacts) reacts += Number(st.reacts[k]) || 0;
  var sm = {
    card: st.card, hall: going.filter(function (g) { return String(g.present) === '1'; }).length, going: going.length,
    online: Object.keys(st.joined).length, msgs: cnt('msg'), steps: cnt('step'), reacts: reacts,
    prayers: st.feed.filter(function (f) { return f.t === 'pray'; }).map(function (f) { return f.x; }).slice(0, 20),
    pins: st.feed.filter(function (f) { return f.t === 'pin'; }).map(function (f) { return f.x; }).slice(0, 10),
    text: txt(b.summary, 1500), by: first(u.name), minutes: st.opened ? Math.round((Date.now() - st.opened) / 60000) : 0
  };
  st.status = 'ended'; st.summary = sm; st.closed = Date.now(); st.hands = [];
  roomSaveRow(st, { status: 'ended', summary: JSON.stringify(sm), closed: st.closed, hands: '[]' });
  roomPut(st);
  return { flash: { roomClosed: st.key } };
};
ACTIONS.roomClose.leader = true;
['sermonSave', 'sermonDel', 'eventSave', 'eventDel', 'settingsSave', 'moderate', 'role', 'requestDone', 'broadcast'].forEach(function (k) { ACTIONS[k].admin = true; });
ACTIONS.presence.leader = true;
ACTIONS.verseAdd.leader = true;
ACTIONS.verseDel.leader = true;

/* ================= бот ================= */

var T = {
  uk: {
    askName: 'Вітаємо в церкві «Місто Світла»! 🙌\n\nЩоб увійти в застосунок, потрібні лише дві речі. Як тебе звати? Напиши ім’я та прізвище.',
    askContact: function (n) { return 'Дякуємо, ' + n + '! Тепер натисни кнопку «Поділитися контактом» нижче. Номер бачать лише служителі церкви.'; },
    pressContact: 'Натисни кнопку «Поділитися контактом» нижче 👇',
    ownContact: 'Поділись, будь ласка, саме своїм контактом кнопкою нижче.',
    share: '📱 Поділитися контактом',
    done: 'Готово, реєстрацію завершено ✅',
    roles: { prayer: 'Молитовна команда', leader: 'Лідер групи', minister: 'Служитель' },
    roleGiven: function (r) { return '🔑 Тобі надано роль «' + r + '». Нові можливості вже в застосунку.'; },
    badInvite: 'Це запрошення вже недійсне. Попроси адміністратора надіслати нове. Реєстрація працює як звичайно.',
    welcome: function (n) { return (n ? n + ', р' : 'Р') + 'аді тебе бачити! Розклад, Біблія, HeavenOS і молитва — у застосунку. Вперше тут? Торкнись вівці Бені на головній: вона покаже, що де.'; },
    open: 'Відкрити застосунок', verse: 'Вірш дня', read: 'Читати розділ',
    remind: function (t, time) { return '⏰ Нагадування: «' + t + '» сьогодні о ' + time + '. Чекаємо тебе!'; },
    roomLive: 'Домашня група HeavenOS вже почалась. Приєднуйся онлайн: картка тижня, питання, молитва.', join: 'Приєднатися',
    prayed: function (n, lines) { return '🙏 Сьогодні за тебе помолилися: ' + n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'людина' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'людини' : 'людей') + '.' + (lines ? '\n\n' + lines : '') + '\n\nТи не сам. Коли Бог відповість, познач це в застосунку.'; },
    answered: function (t) { return '🙌 Бог відповів!\n\nТи молився за потребу «' + t + '». Людина позначила, що молитва отримала відповідь. Дякуємо, що ти молився!'; }
  },
  ru: {
    askName: 'Добро пожаловать в церковь «Місто Світла»! 🙌\n\nЧтобы войти в приложение, нужны всего две вещи. Как тебя зовут? Напиши имя и фамилию.',
    askContact: function (n) { return 'Спасибо, ' + n + '! Теперь нажми кнопку «Поделиться контактом» ниже. Номер видят только служители церкви.'; },
    pressContact: 'Нажми кнопку «Поделиться контактом» ниже 👇',
    ownContact: 'Поделись, пожалуйста, именно своим контактом кнопкой ниже.',
    share: '📱 Поделиться контактом',
    done: 'Готово, регистрация завершена ✅',
    roles: { prayer: 'Молитвенная команда', leader: 'Лидер группы', minister: 'Служитель' },
    roleGiven: function (r) { return '🔑 Тебе выдана роль «' + r + '». Новые возможности уже в приложении.'; },
    badInvite: 'Это приглашение уже недействительно. Попроси администратора прислать новое. Регистрация работает как обычно.',
    welcome: function (n) { return (n ? n + ', р' : 'Р') + 'ады тебя видеть! Расписание, Библия, HeavenOS и молитва — в приложении. Впервые здесь? Коснись овцы Бени на главной: она покажет, что где.'; },
    open: 'Открыть приложение', verse: 'Стих дня', read: 'Читать главу',
    remind: function (t, time) { return '⏰ Напоминание: «' + t + '» сегодня в ' + time + '. Ждём тебя!'; },
    roomLive: 'Домашняя группа HeavenOS уже началась. Присоединяйся онлайн: карточка недели, вопросы, молитва.', join: 'Присоединиться',
    prayed: function (n, lines) { return '🙏 Сегодня за тебя помолились: ' + n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'человек' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'человека' : 'человек') + '.' + (lines ? '\n\n' + lines : '') + '\n\nТы не один. Когда Бог ответит, отметь это в приложении.'; },
    answered: function (t) { return '🙌 Бог ответил!\n\nТы молился за нужду «' + t + '». Человек отметил, что молитва получила ответ. Спасибо, что ты молился!'; }
  },
  en: {
    askName: 'Welcome to Misto Svitla church! 🙌\n\nTo get into the app we need just two things. What is your name? Type your first and last name.',
    askContact: function (n) { return 'Thank you, ' + n + '! Now tap «Share contact» below. Only church ministers can see your number.'; },
    pressContact: 'Tap the «Share contact» button below 👇',
    ownContact: 'Please share your own contact with the button below.',
    share: '📱 Share contact',
    done: 'Done, you are registered ✅',
    roles: { prayer: 'Prayer team', leader: 'Group leader', minister: 'Minister' },
    roleGiven: function (r) { return '🔑 You have been given the role «' + r + '». New features are already in the app.'; },
    badInvite: 'This invitation is no longer valid. Ask an admin for a new one. Registration works as usual.',
    welcome: function (n) { return (n ? n + ', g' : 'G') + 'ood to see you! Schedule, Bible, HeavenOS and prayer are in the app. New here? Tap Benya the sheep on the home screen and she will show you around.'; },
    open: 'Open the app', verse: 'Verse of the day', read: 'Read the chapter',
    remind: function (t, time) { return '⏰ Reminder: «' + t + '» today at ' + time + '. See you there!'; },
    roomLive: 'HeavenOS home group has started. Join online: card of the week, questions, prayer.', join: 'Join',
    prayed: function (n, lines) { return '🙏 Today ' + n + (n === 1 ? ' person' : ' people') + ' prayed for you.' + (lines ? '\n\n' + lines : '') + '\n\nYou are not alone. When God answers, mark it in the app.'; },
    answered: function (t) { return '🙌 God answered!\n\nYou prayed for «' + t + '». The person marked that the prayer was answered. Thank you for praying!'; }
  }
};

var INVITE_ROLES = ['prayer', 'leader', 'minister'];
function botName() {
  var n = prop('BOT_NAME');
  if (!n) { var me = tgCall('getMe', {}); n = me && me.result && me.result.username || ''; if (n) PropertiesService.getScriptProperties().setProperty('BOT_NAME', n); }
  return n;
}
/** Посилання-запрошення: /start r_leader_<код>. Роль видається після реєстрації і лише в бік підвищення. */
function takeInvite(id, text) {
  var m = String(text).match(/^\/start\s+r_(prayer|leader|minister)_([a-z0-9]+)$/);
  if (!m) return null;
  if (prop('INV_' + m[1]) !== m[2]) return 'bad';
  CacheService.getScriptCache().put('inv:' + id, m[1], 21600);
  return m[1];
}
function applyInvite(u, t) {
  var c = CacheService.getScriptCache(), role = c.get('inv:' + u.id);
  if (!role) return;
  c.put('inv:' + u.id, '', 1);
  if (ROLES.indexOf(role) <= ROLES.indexOf(roleOf(u))) return;
  u.role = role; setRow('Users', u);
  send(u.id, t.roleGiven(t.roles[role]));
  notifyRoles(['admin'], '🔑 ' + u.name + ' отримав(ла) роль «' + T.uk.roles[role] + '» за посиланням-запрошенням.');
}

function onUpdate(up) {
  var m = up.message;
  if (!m || !m.chat || m.chat.type !== 'private' || !m.from || m.from.is_bot) return;
  var id = String(m.from.id), lang = String(m.from.language_code || '').indexOf('ru') === 0 ? 'ru' : 'uk', t = T[lang];
  var text = String(m.text || '').trim(), u = findUser(id), inv = takeInvite(id, text), src = /^\/start\s/.test(text) ? srcOf(text) : '';
  if (u && src && !u.src && u.status !== 'ok') { u.src = src; setRow('Users', u); }
  if (inv === 'bad') { send(id, t.badInvite); inv = null; }

  if (m.contact) {
    if (!u) { addRow('Users', { id: id, name: '', phone: '', username: m.from.username || '', role: 'member', status: 'name', lang: lang, created: Date.now(), src: src }); send(id, t.askName, { remove_keyboard: true }); return; }
    if (String(m.contact.user_id) !== id) { send(id, t.ownContact, contactKb(t)); return; }
    var wasOk = u.status === 'ok';
    if (!u.name) u.name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
    u.phone = (String(m.contact.phone_number).charAt(0) === '+' ? '' : '+') + m.contact.phone_number;
    u.username = m.from.username || ''; u.status = 'ok'; u.lang = u.lang || lang;
    setRow('Users', u);
    var first = !wasOk && claimJoin(id);
    if (!wasOk && !first) return; // номер уже прийшов через застосунок — не дублюємо
    send(id, t.done, { remove_keyboard: true });
    applyInvite(u, t);
    welcome(id, u, t);
    if (first) notifyRoles(['admin'], '👋 Новий учасник: ' + u.name + ', ' + u.phone + (u.username ? ', @' + u.username : '') + (u.src ? ' (джерело: ' + srcName(u.src) + ')' : ''));
    return;
  }
  if (!u) {
    addRow('Users', { id: id, name: '', phone: '', username: m.from.username || '', role: 'member', status: 'name', lang: lang, created: Date.now(), src: src });
    send(id, t.askName, { remove_keyboard: true });
    return;
  }
  if (u.status === 'ok') { if (inv) applyInvite(u, t); welcome(id, u, t); return; }
  if (/^\/start/.test(text)) { u.status = 'name'; setRow('Users', u); send(id, t.askName, { remove_keyboard: true }); return; }
  if (u.status === 'name') {
    if (!text || text.charAt(0) === '/') { send(id, t.askName); return; }
    u.name = text.replace(/\s+/g, ' ').slice(0, 60); u.status = 'contact'; u.username = m.from.username || '';
    setRow('Users', u);
    send(id, t.askContact(u.name), contactKb(t));
    return;
  }
  send(id, t.pressContact, contactKb(t));
}

function contactKb(t) { return { keyboard: [[{ text: t.share, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }; }
function appButton(label, url) { return { inline_keyboard: [[{ text: label, web_app: { url: url || prop('APP_URL') } }]] }; }
function welcome(id, u, t) { send(id, t.welcome(first(u.name)), appButton(t.open)); }

function tgCall(method, payload) {
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('BOT_TOKEN') + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  return parseJ(r.getContentText(), {});
}
function send(chatId, text, markup) {
  var p = { chat_id: String(chatId), text: text };
  if (markup) p.reply_markup = markup;
  return tgCall('sendMessage', p);
}
/** Надсилає багато повідомлень пачками, щоб не впертися в ліміти Telegram. Повертає кількість успішних. */
function sendMany(list) {
  var url = 'https://api.telegram.org/bot' + prop('BOT_TOKEN') + '/sendMessage', ok = 0;
  for (var i = 0; i < list.length; i += 25) {
    var reqs = list.slice(i, i + 25).map(function (p) { return { url: url, method: 'post', contentType: 'application/json', payload: JSON.stringify(p), muteHttpExceptions: true }; });
    UrlFetchApp.fetchAll(reqs).forEach(function (r) { if (r.getResponseCode() === 200) ok++; });
    if (i + 25 < list.length) Utilities.sleep(1100);
  }
  return ok;
}
function notifyRoles(roles, text) {
  var to = rows('Users').filter(function (x) { return x.status === 'ok' && roles.indexOf(roleOf(x)) >= 0; });
  if (to.length) sendMany(to.map(function (x) { return { chat_id: String(x.id), text: text }; }));
}

/* ================= розклад: вірш дня і нагадування ================= */

function minutesOf(hm) { var p = String(hm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function verseOfDay(isoDate) {
  var p = isoDate.split('-'), n = Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5);
  return VERSES[((n % VERSES.length) + VERSES.length) % VERSES.length];
}

function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { verseJob(); } catch (e) { log('verse', e); }
  try { remindJob(); } catch (e) { log('remind', e); }
  try { prayDigestJob(); } catch (e) { log('prayDigest', e); }
  try { weekDigestJob(); } catch (e) { log('weekDigest', e); }
  finally { lock.releaseLock(); }
}

/* Вірш дня: у кожного свій час (personal.verseAt, крок 15 хв), інакше — загальний verseTime. */
function verseJob() {
  var st = settingsAll(), now = new Date(), today = kyivDate(now), props = PropertiesService.getScriptProperties();
  var nowMin = minutesOf(Utilities.formatDate(now, TZ, 'HH:mm')), last = String(props.getProperty('verseLast') || '').split('|');
  var from = last[0] === today ? Number(last[1]) : (last[0] ? -1 : nowMin - 16); // перший запуск не розсилає за весь день
  props.setProperty('verseLast', today + '|' + nowMin);
  if (nowMin <= from) return;
  var def = /^\d{2}:\d{2}$/.test(st.verseTime) ? st.verseTime : '07:30';
  var v = null, base = prop('APP_URL'), link = '';
  var list = [];
  rows('Users').forEach(function (x) {
    if (x.status !== 'ok') return;
    var pp = parseJ(x.personal, {});
    if (!pp.verseOn) return;
    var at = /^\d{2}:\d{2}$/.test(String(pp.verseAt || '')) ? pp.verseAt : def, m = minutesOf(at);
    if (m <= from || m > nowMin) return;
    if (!v) { v = verseOfDay(today); link = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'v=' + v.loc.join(':'); }
    var l = langOf(x), t = T[l];
    list.push({ chat_id: String(x.id), text: '✨ ' + t.verse + '\n\n«' + v.t[l] + '»\n— ' + v.ref[l], reply_markup: appButton(t.read, link) });
  });
  if (list.length) sendMany(list);
}

function remindJob() {
  var st = settingsAll(), mins = Number(st.remind) || 0;
  if (mins <= 0) return;
  var now = Date.now(), users = {}, list = [];
  rows('Users').forEach(function (x) { users[String(x.id)] = x; });
  rows('Going').forEach(function (g) {
    if (String(g.reminded) === '1') return;
    var x = eventByKey(g.key);
    if (!x) return;
    var start = startOf(x.date, x.ev.time).getTime(), left = (start - now) / 60000;
    if (left <= 0 || left > mins) return;
    var p = users[String(g.userId)];
    if (p && p.status === 'ok') {
      var l = langOf(p);
      list.push({ chat_id: String(p.id), text: T[l].remind(x.ev.title[l] || x.ev.title.uk, x.ev.time), reply_markup: appButton(T[l].open) });
    }
    g.reminded = '1'; setRow('Going', g);
  });
  if (list.length) sendMany(list);
  // прибрати старі відмітки (старші за 60 днів), щоб таблиця не росла безкінечно
  var old = kyivDate(new Date(now - 60 * 864e5));
  var stale = rows('Going').filter(function (g) { var d = String(g.key).split('@')[1]; return d && d < old; });
  if (stale.length) delRows('Going', stale);
}

/* Хто зараз у застосунку: застосунок відмічається раз на 90 с, рахуємо тих, хто був за останні 3 хвилини.
   Без блокування: рідкісна гонка може на хвилину загубити одну людину, для лічильника це не страшно. */
function onlineMark(id) {
  var c = CacheService.getScriptCache(), m = parseJ(c.get('online'), {}), now = Date.now(), o = {};
  for (var k in m) if (now - Number(m[k]) < 180000) o[k] = m[k];
  o[String(id)] = now;
  c.put('online', JSON.stringify(o), 600);
  return Object.keys(o).length;
}

/* Молитви в «Хвилині тиші» за загальні теми (без конкретної потреби): лічильник по днях у властивостях скрипта. */
function quietLit(now) {
  var props = PropertiesService.getScriptProperties(), sum = 0;
  for (var i = 0; i < 7; i++) sum += Number(props.getProperty('qlit:' + kyivDate(new Date(now - i * 864e5)))) || 0;
  return sum;
}

/* Потребу позначили «Бог відповів»: кажемо про це всім, хто за неї молився. */
function answeredNotify(n) {
  var ids = {};
  parseJ(n.prayers, []).forEach(function (p) { ids[String(p[0])] = 1; });
  delete ids[String(n.userId)];
  var short = String(n.text || '').length > 160 ? String(n.text).slice(0, 157) + '…' : String(n.text || '');
  var list = rows('Users').filter(function (p) { return p.status === 'ok' && ids[String(p.id)]; }).map(function (p) {
    var t = T[langOf(p)];
    return { chat_id: String(p.id), text: t.answered(short), reply_markup: appButton(t.open, prop('APP_URL') + '#prayer') };
  });
  if (list.length) sendMany(list);
}

/* О 20:00 автор потреби дізнається, скільки людей за нього помолилися за добу. Один раз на день. */
function prayDigestJob(now) {
  now = now || new Date(); var props = PropertiesService.getScriptProperties(), today = kyivDate(now);
  if (minutesOf(Utilities.formatDate(now, TZ, 'HH:mm')) < 20 * 60 || props.getProperty('prayDigest') === today) return;
  var since = Number(props.getProperty('prayDigestAt')) || now.getTime() - 864e5;
  props.setProperty('prayDigest', today); props.setProperty('prayDigestAt', String(now.getTime()));
  var per = {};
  rows('Needs').forEach(function (n) {
    if (n.status === 'answered') return;
    var who = {};
    parseJ(n.prayers, []).forEach(function (p) { if (Number(p[1]) > since && String(p[0]) !== String(n.userId)) who[String(p[0])] = 1; });
    var c = Object.keys(who).length;
    if (!c) return;
    var a = per[String(n.userId)] || (per[String(n.userId)] = { people: {}, needs: [] });
    Object.keys(who).forEach(function (k) { a.people[k] = 1; });
    a.needs.push({ text: String(n.text || ''), n: c });
  });
  var list = rows('Users').filter(function (p) { return p.status === 'ok' && per[String(p.id)]; }).map(function (p) {
    var a = per[String(p.id)], t = T[langOf(p)];
    var lines = a.needs.length > 1 ? a.needs.slice(0, 5).map(function (q) { return '• «' + (q.text.length > 60 ? q.text.slice(0, 57) + '…' : q.text) + '» — ' + q.n; }).join('\n') : '';
    return { chat_id: String(p.id), text: t.prayed(Object.keys(a.people).length, lines), reply_markup: appButton(t.open, prop('APP_URL') + '#prayer') };
  });
  if (list.length) sendMany(list);
}

function srcCount(list) {
  var c = {};
  list.forEach(function (x) { var k = String(x.src || ''); c[k] = (c[k] || 0) + 1; });
  return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return srcName(k) + ' ' + c[k]; }).join(', ');
}

/* Неділя, 20:00: коротке зведення тижня для адміністраторів. */
function weekDigestJob(now) {
  now = now || new Date(); var props = PropertiesService.getScriptProperties(), today = kyivDate(now);
  if (Utilities.formatDate(now, TZ, 'u') !== '7' || minutesOf(Utilities.formatDate(now, TZ, 'HH:mm')) < 20 * 60 || props.getProperty('weekDigest') === today) return;
  props.setProperty('weekDigest', today);
  var weekAgo = now.getTime() - 7 * 864e5, users = rows('Users').filter(function (x) { return x.status === 'ok'; });
  var fresh = users.filter(function (x) { return Number(x.created) > weekAgo; });
  var prayers = 0, needs = 0, answered = 0;
  rows('Needs').forEach(function (n) {
    if (Number(n.created) > weekAgo) needs++;
    parseJ(n.prayers, []).forEach(function (p) { if (Number(p[1]) > weekAgo) prayers++; });
  });
  rows('Tests').forEach(function (t2) { if (Number(t2.created) > weekAgo && t2.needId) answered++; });
  var going = {}, from = kyivDate(new Date(now.getTime() - 6 * 864e5));
  rows('Going').forEach(function (g) {
    var x = eventByKey(g.key);
    if (!x || x.date < from || x.date > today) return;
    var k = x.ev.title.uk + ' (' + x.date.slice(8, 10) + '.' + x.date.slice(5, 7) + ')';
    going[k] = (going[k] || 0) + 1;
  });
  var pend = rows('Tests').filter(function (t2) { return t2.status === 'pending'; }).length + rows('Ads').filter(function (a) { return a.status === 'pending'; }).length;
  var reqs = rows('Requests').filter(function (r) { return r.status === 'new'; }).length;
  var g = Object.keys(going).map(function (k) { return '• ' + k + ': ' + going[k]; }).join('\n');
  var text = '📊 Тиждень у застосунку\n\n' +
    '👋 Нових учасників: ' + fresh.length + (fresh.length ? ' (' + fresh.slice(0, 8).map(function (x) { return first(x.name); }).join(', ') + (fresh.length > 8 ? '…' : '') + ')' : '') + '\n' +
    (fresh.length ? '🧭 Звідки: ' + srcCount(fresh) + '\n' : '') +
    '👥 Усього учасників: ' + users.length + '\n' +
    '🙏 Молитов: ' + (prayers + quietLit(now.getTime())) + ', нових потреб: ' + needs + (answered ? ', свідчень про відповідь: ' + answered : '') + '\n' +
    (g ? '\n✋ Відмітили «Я буду»:\n' + g + '\n' : '') +
    (pend || reqs ? '\n⏳ Чекають на вас: ' + [pend ? 'модерація ' + pend : '', reqs ? 'заявки ' + reqs : ''].filter(Boolean).join(', ') : '\n✅ Модерація й заявки розібрані');
  var to = users.filter(function (x) { return roleOf(x) === 'admin'; });
  if (to.length) sendMany(to.map(function (x) { return { chat_id: String(x.id), text: text, reply_markup: appButton('Адмінка', prop('APP_URL') + '#admin') }; }));
}

/* ================= встановлення ================= */

/** 1) Запустіть один раз після заповнення Script properties: створює аркуші, події, налаштування й розклад. */
function setup() {
  Object.keys(SHEETS).forEach(sheet);
  if (!rows('Events').length) EVENTS_DEFAULT.forEach(function (e, i) {
    addRow('Events', { id: e.id, type: e.type, dow: e.dow.join(','), dates: e.dates.join(','), time: e.time, kind: e.kind,
      title_uk: e.title_uk, title_ru: e.title_ru, who_uk: e.who_uk || '', who_ru: e.who_ru || '', where_uk: e.where_uk || '', where_ru: e.where_ru || '',
      desc_uk: e.desc_uk || '', desc_ru: e.desc_ru || '', link: e.link || '', active: '1', order: String(i + 1) });
  });
  var have = rows('Settings').map(function (r) { return r.key; });
  Object.keys(SETTINGS_DEFAULT).forEach(function (k) { if (have.indexOf(k) < 0) addRow('Settings', { key: k, value: SETTINGS_DEFAULT[k] }); });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(15).create();
  var miss = ['BOT_TOKEN', 'APP_URL', 'ADMIN_IDS'].filter(function (k) { return !prop(k); });
  Logger.log(miss.length ? 'Готово, але не заповнено: ' + miss.join(', ') : 'Готово. Тепер Deploy → New deployment → Web app, впишіть WEBAPP_URL і запустіть connectBot().');
}

/** 2) Запустіть після Deploy (і щоразу, коли змінюється адреса /exec): підключає бота до цього скрипта. */
function connectBot() {
  var hook = prop('WEBAPP_URL');
  if (!/\/exec$/.test(hook)) throw new Error('Вкажіть WEBAPP_URL — адресу Web app, що закінчується на /exec');
  Logger.log(JSON.stringify(tgCall('setWebhook', { url: hook, allowed_updates: ['message'], drop_pending_updates: true })));
  Logger.log(JSON.stringify(tgCall('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Застосунок', web_app: { url: prop('APP_URL') } } })));
  Logger.log(JSON.stringify(tgCall('setMyCommands', { commands: [{ command: 'start', description: 'Реєстрація / відкрити застосунок' }] })));
  Logger.log(JSON.stringify(tgCall('getWebhookInfo', {})));
}

/** Перевірка: показує стан вебхука (помилки доставки від Telegram). */
function checkBot() { Logger.log(JSON.stringify(tgCall('getWebhookInfo', {}))); }
