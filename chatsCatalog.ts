// Motorcycle & Snowmobile Chat Catalog Definition with Real Database Sync & AI-Digests Engine
import { db } from './database';

export interface ChatCatalogItem {
  slug: string;
  username: string;
  title: string;
  brand: string;
  category: 'Брендовые' | 'Регионы' | 'Сервисные' | 'Снегоходы';
  image: string;
  shortDesc: string;
  fullDesc: string;
  modelsCovered: string[];
  keyTopics: string[];
  rules: string[];
  telegramLink: string;
  estimatedMembers: number;
}

export interface ChatDailySummary {
  id: string;
  chatSlug: string;
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "27 августа 2026"
  title: string;
  messageCount: number;
  activeUsersCount: number;
  topics: {
    emoji: string;
    title: string;
    description: string;
  }[];
  rawSummaryHtml: string;
  createdAt: string;
  isReal?: boolean;
}

// Explicit Mapping between Catalog Slugs and Database Chat IDs / Titles
export const CHAT_TO_DB_MAPPING: Record<string, { id?: string; altTitles?: string[]; altUsernames?: string[] }> = {
  "motoblacklist": { id: "-2072373857896", altTitles: ["мото продавцы - чёрный список", "чёрный список", "черный список", "motoblacklist"], altUsernames: ["motoblacklist"] },
  "bikersrus": { id: "-1001871635723", altTitles: ["гараж байкера", "моточат россия", "байкеры", "bikersrus"], altUsernames: ["bikersrus"] },
  "motokostroma": { id: "-1001782738751", altTitles: ["мото 76rus", "мото кострома", "кострома"], altUsernames: ["motokostroma"] },
  "motoivanovo": { id: "-1001782738751", altTitles: ["мото 76rus", "мото иваново", "иваново"], altUsernames: ["motoivanovo"] },
  "motonnchat": { id: "-1001782738751", altTitles: ["мото 76rus", "мото нижний новгород", "нижний новгород"], altUsernames: ["motonnchat"] },
  "motoyar": { id: "-1001782738751", altTitles: ["мото 76rus", "моточат ярославль", "ярославль"], altUsernames: ["motoyar"] },
  "bmwgsclub": { id: "-1001733452018", altTitles: ["bmw gs россия", "bmw gs", "bmwgsclub"], altUsernames: ["bmwgsclub"] },
  "bmwtourclub": { id: "-1001955618289", altTitles: ["bmw lt / rt / gt / st club", "bmw tour", "bmwtourclub"], altUsernames: ["bmwtourclub"] },
  "bserus": { id: "-1001826966736", altTitles: ["bse чат", "bse", "bserus"], altUsernames: ["bserus"] },
  "cfmotorus": { id: "-1001810298562", altTitles: ["cfmoto club", "cfmoto", "cfmotorus"], altUsernames: ["cfmotorus"] },
  "hondacbrus": { id: "-1002464039058", altTitles: ["honda cb клуб", "honda cb", "hondacbrus"], altUsernames: ["hondacbrus"] },
  "hondacbrrus": { id: "-1001799948311", altTitles: ["honda cbr россия", "honda cbr", "hondacbrrus"], altUsernames: ["hondacbrrus"] },
  "hondaglrus": { id: "-1002300458331", altTitles: ["honda gold wing", "gold wing", "hondaglrus"], altUsernames: ["hondaglrus"] },
  "steedrus": { id: "-1001734806989", altTitles: ["honda steed россия", "honda steed", "steedrus"], altUsernames: ["steedrus"] },
  "hondarebel": { id: "-1002158355542", altTitles: ["honda vtx / vt чат", "honda rebel", "hondarebel"], altUsernames: ["hondarebel"] },
  "varaderorus": { id: "-1001887901789", altTitles: ["honda varadero россия", "honda varadero", "transalp", "varaderorus"], altUsernames: ["varaderorus"] },
  "hondavfrclub": { id: "-1002367446968", altTitles: ["honda vfr клуб", "honda vfr", "hondavfrclub"], altUsernames: ["hondavfrclub"] },
  "hondavtx": { id: "-1002158355542", altTitles: ["honda vtx / vt чат", "honda vtx", "hondavtx"], altUsernames: ["hondavtx"] },
  "er6club": { id: "-1001836683851", altTitles: ["kawasaki er6", "er6", "ninja 650", "er6club"], altUsernames: ["er6club"] },
  "kleclub": { id: "-1001683056322", altTitles: ["kawasaki kl/kle россия", "kawasaki kl", "kle", "kleclub"], altUsernames: ["kleclub"] },
  "zzrrus": { id: "-1001867583967", altTitles: ["kawasaki zzr / ninja россия", "kawasaki zzr", "zzr", "zzrrus"], altUsernames: ["zzrrus"] },
  "ridersvulcan": { id: "-1002274275430", altTitles: ["kawasaki vulcan клуб", "kawasaki vulcan", "vulcan", "ridersvulcan"], altUsernames: ["ridersvulcan"] },
  "dukerus": { id: "-1001849805773", altTitles: ["ktm duke чат", "ktm duke", "ktm", "dukerus"], altUsernames: ["dukerus"] },
  "kayoclub": { id: "-1001741000843", altTitles: ["kayo россия", "kayo", "kayoclub"], altUsernames: ["kayoclub"] },
  "gsfclub": { id: "-1001818008642", altTitles: ["suzuki bandit россия", "suzuki bandit", "bandit", "gsfclub"], altUsernames: ["gsfclub"] },
  "djebelrus": { id: "-1001833524716", altTitles: ["suzuki djebel россия", "suzuki djebel", "djebel", "djebelrus"], altUsernames: ["djebelrus"] },
  "gsxrclub": { id: "-1001837149695", altTitles: ["suzuki gsx-r россия", "suzuki gsx-r", "gsxr", "gsxrclub"], altUsernames: ["gsxrclub"] },
  "boulevardrus": { id: "-1001545058497", altTitles: ["suzuki intruder / boulevard россия", "intruder", "boulevard", "boulevardrus"], altUsernames: ["boulevardrus"] },
  "skywaveclub": { id: "-1001927190564", altTitles: ["suzuki skywave / burgman", "skywave", "burgman", "skywaveclub"], altUsernames: ["skywaveclub"] },
  "vstromrus": { id: "-1001545836795", altTitles: ["v-strom россия чат", "v-strom", "vstromrus"], altUsernames: ["vstromrus"] },
  "yamahastarrus": { id: "-1001735277068", altTitles: ["yamaha star россия", "yamaha star", "dragstar", "royal star", "yamahastarrus"], altUsernames: ["yamahastarrus"] },
  "yamahafazerclub": { id: "-1001870018229", altTitles: ["yamaha fazer россия", "yamaha fazer", "fazer", "yamahafazerclub"], altUsernames: ["yamahafazerclub"] },
  "r1r6club": { id: "-1001896456088", altTitles: ["yamaha r1 & r6", "yamaha r1", "r6", "r1r6club"], altUsernames: ["r1r6club"] },
  "tenereclub": { id: "-1001894505954", altTitles: ["yamaha tenere & super tenere россия", "tenere", "super tenere", "tenereclub"], altUsernames: ["tenereclub"] },
  "yamahatdmrus": { id: "-1001663751066", altTitles: ["yamaha tdm россия", "yamaha tdm", "tdm", "yamahatdmrus"], altUsernames: ["yamahatdmrus"] },
  "vmaxrus": { id: "-1001528582393", altTitles: ["yamaha v-max россия", "yamaha v-max", "vmax", "vmaxrus"], altUsernames: ["vmaxrus"] },
  "clubxjr": { id: "-1002080989246", altTitles: ["yamaha xjr и fj клуб", "yamaha xjr", "xjr", "clubxjr"], altUsernames: ["clubxjr"] },
  "diversionclub": { id: "-1002398256015", altTitles: ["yamaha diversion клуб", "yamaha diversion", "diversion", "diversionclub"], altUsernames: ["diversionclub"] },
  "brpsnow": { id: "-1002292994867", altTitles: ["снегоходы brp", "brp", "brpsnow"], altUsernames: ["brpsnow"] },
  "polarissnow": { id: "-1002397139703", altTitles: ["снегоходы polaris", "polaris", "polarissnow"], altUsernames: ["polarissnow"] },
  "stelscaptain": { id: "-1002049704707", altTitles: ["stels капитан", "капитан", "stelscaptain"], altUsernames: ["stelscaptain"] }
};

export const CHATS_CATALOG: ChatCatalogItem[] = [
  // --- Главные и регионы ---
  {
    slug: 'motoblacklist',
    username: 'MotoBlackList',
    title: 'Чёрный список мото-продавцов',
    brand: 'Безопасность',
    category: 'Сервисные',
    image: 'assets/img/a94f1d5d-5294-4b31-a24f-a88cd3214e54-10670838.jpeg',
    shortDesc: 'Проверка продавцов, защита от мошенников и недобросовестных сервисов.',
    fullDesc: 'Крупнейшая база отзывов и разоблачений недобросовестных продавцов мототехники, запчастей и экипировки. Сообщество помогает байкерам проверять подозрительные объявления на Авито, Авто.ру и в Telegram-каналах перед отправкой предоплаты, делиться доказательствами мошенничества и защищать мотоциклистов от обмана.',
    modelsCovered: ['Вся мототехника', 'Запчасти и экипировка', 'Мотосервисы и мотоподбор'],
    keyTopics: ['Проверка продавцов перед покупкой', 'Мошеннические схемы на досках объявлений', 'Черный список недобросовестных сервисов', 'Рекомендации по безопасным сделкам'],
    rules: ['Публикация жалоб только с доказательствами (скриншоты переписок, чеки)', 'Запрещены необоснованные обвинения и оскорбления', 'Строгая модерация спама и флуда'],
    telegramLink: 'https://t.me/MotoBlackList',
    estimatedMembers: 14500
  },
  {
    slug: 'bikersrus',
    username: 'BikersRus',
    title: 'Моточат Россия',
    brand: 'Всероссийский',
    category: 'Регионы',
    image: 'assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg',
    shortDesc: 'Главное мотосообщество страны. Общение байкеров всех направлений.',
    fullDesc: 'Единая площадка для мотоциклистов со всей России. Обсуждение дальних путешествий, мотофестивалей, юридических аспектов владения байком, взаимопомощь на дорогах в случае поломок и ДТП, поиск попутчиков для мотопрохватов и вечернее неформальное общение.',
    modelsCovered: ['Туреры', 'Круизеры', 'Спортбайки', 'Эндуро / Турэндуро', 'Классики'],
    keyTopics: ['Взаимопомощь на дорогах (Хелп-лист)', 'Мотопутешествия по России и миру', 'Новости мотоиндустрии и изменения в ПДД', 'Организация слетов и открытие/закрытие сезона'],
    rules: ['Уважительное общение без перехода на личности', 'Запрещена несогласованная коммерческая реклама', 'Помощь попавшим в беду в приоритете'],
    telegramLink: 'https://t.me/BikersRus',
    estimatedMembers: 18200
  },
  {
    slug: 'motokostroma',
    username: 'motokostroma',
    title: 'Моточат Кострома',
    brand: 'Кострома',
    category: 'Регионы',
    image: 'assets/img/f829ec0b-fe22-4876-bce7-74274c43920c-5431475.jpeg',
    shortDesc: 'Сообщество мотоциклистов Костромы и Костромской области.',
    fullDesc: 'Региональный чат мотоциклистов Костромской области: совместные покатушки выходного дня, информация о состоянии дорожного покрытия, проверенные мотосервисы и шиномонтажи города, оперативная помощь при поломках и дружеские встречи.',
    modelsCovered: ['Все классы мототехники Костромы и области'],
    keyTopics: ['Маршруты вокруг Волги и по области', 'Состояние асфальта и ямы на дорогах', 'Локальные сервисы и заказ запчастей', 'Городские мотопрохваты и сборы на набережной'],
    rules: ['Уважение к местным мотобратьям', 'Без коммерческого спама', 'Координация покатушек'],
    telegramLink: 'https://t.me/motokostroma',
    estimatedMembers: 2400
  },
  {
    slug: 'motoivanovo',
    username: 'motoivanovo',
    title: 'Моточат Иваново',
    brand: 'Иваново',
    category: 'Регионы',
    image: 'assets/img/b8221b2d-1ea3-4cf1-97ba-2caeb4bf58ec-5431476.jpeg',
    shortDesc: 'Мотосообщество Иваново и Ивановской области (Шуя, Кинешма, Тейково).',
    fullDesc: 'Объединение байкеров Иваново и близлежащих городов. Координация выездов на треки и кроссовые трассы, обмен опытом владения дорожными и эндуро мотоциклами, обсуждение городских событий и взаимовыручка.',
    modelsCovered: ['Дорожные мотоциклы', 'Эндуро и питбайки', 'Чопперы и круизеры'],
    keyTopics: ['Эндуро-маршруты по лесам Ивановской области', 'Где обслужить вилку и карбюраторы в Иваново', 'Сборы мотоциклистов в центре города', 'Купля-продажа экипа из рук в руки'],
    rules: ['Дружелюбие и взаимопомощь', 'Без мата и токсичности', 'Соблюдение безопасности'],
    telegramLink: 'https://t.me/motoivanovo',
    estimatedMembers: 3100
  },
  {
    slug: 'motonnchat',
    username: 'motonnchat',
    title: 'Моточат Нижний Новгород',
    brand: 'Нижний Новгород',
    category: 'Регионы',
    image: 'assets/img/320bb269-83bc-42b7-a36c-2f98e578eb04-5431477.jpeg',
    shortDesc: 'Мотосообщество Нижнего Новгорода, Дзержинска и Нижегородской области.',
    fullDesc: 'Большой активный моточат Нижегородской области. Обсуждение покатушек по живописным набережным Оки и Волги, трек-дни на трассе «Нижегородское Кольцо» (NRing), проверенные специалисты по электрике и настройке карбюраторов/инжекторов.',
    modelsCovered: ['Спортбайки', 'Турэндуро', 'Круизеры', 'Стриты и классики'],
    keyTopics: ['Трек-дни и тренировки на NRing', 'Мотомаршруты: Городец, Арзамас, Дивеево', 'Местные мотомастерские и подбор масла', 'Взаимопомощь при поломках на трассах М7 и Р158'],
    rules: ['Без спама и ссылок на сомнительные каналы', 'Уважение к участникам', 'Конструктивный диалог'],
    telegramLink: 'https://t.me/motonnchat',
    estimatedMembers: 5200
  },
  {
    slug: 'motoyar',
    username: 'motoyar',
    title: 'Моточат Ярославль',
    brand: 'Ярославль',
    category: 'Регионы',
    image: 'assets/img/31969ec6-89bf-4509-96cb-bb4df0894562-5431478.jpeg',
    shortDesc: 'Мотосообщество Ярославля, Рыбинска, Переславля и Углича.',
    fullDesc: 'Центральный чат мотоциклистов Золотого Кольца. Совместные поездки вокруг Рыбинского водохранилища, обмен опытом по подготовке мотоциклов к сезону, заказ качественных запчастей и расходников, встречи на Стрелке.',
    modelsCovered: ['Все классы мотоциклов', 'Квадроциклы и снегоходы'],
    keyTopics: ['Маршруты выходного дня по Золотому Кольцу', 'Эндуро вокруг Рыбинского водохранилища', 'Местные моторазборки и проверенные мастера', 'Оповещения о ДТП и поиск свидетелей'],
    rules: ['Взаимоуважение', 'Запрещена политика и спам', 'Помощь на дороге — закон'],
    telegramLink: 'https://t.me/motoyar',
    estimatedMembers: 4100
  },

  // --- BMW ---
  {
    slug: 'bmwgsclub',
    username: 'bmwgsclub',
    title: 'BMW GS Club Russia',
    brand: 'BMW',
    category: 'Брендовые',
    image: 'assets/img/560f7ff1-ff16-43a9-8395-6593a201217e-5431479.jpeg',
    shortDesc: 'Клуб легендарных турэндуро BMW серии GS: R1200GS, R1250GS, R1300GS, F800GS, F850GS, F900GS.',
    fullDesc: 'Крупнейшее сообщество владельцев BMW GS («Гусей») в России. Обсуждение дальних экспедиций (Памир, Алтай, Кольский полуостров, Байкал), тонкости работы оппозитных моторов Boxer и электроники ESA/ShiftCam, выбор резины двойного назначения, доработка подвески и установка оригинального тюнинга Touratech и Wunderlich.',
    modelsCovered: ['BMW R 1300 GS / Adventure', 'BMW R 1250 GS / ADV', 'BMW R 1200 GS (LC / Air-Cooled)', 'BMW F 850 GS / F 900 GS', 'BMW F 800 GS / F 700 GS', 'BMW G 310 GS'],
    keyTopics: ['Обслуживание кардана и редуктора', 'Компьютерная диагностика GS-911 и ISTA', 'Выбор резины для тяжелых грунтов (Mitas E-07, Anakee Wild, Karoo)', 'Подготовка к автономным путешествиям'],
    rules: ['Техническая грамотность и уважение', 'Делимся проверенными треками и точками GPS', 'Запрещен флуд не по теме'],
    telegramLink: 'https://t.me/bmwgsclub',
    estimatedMembers: 9800
  },
  {
    slug: 'bmwtourclub',
    username: 'bmwtourclub',
    title: 'BMW Tour Club (RT / LT / GT / GTL / ST)',
    brand: 'BMW',
    category: 'Брендовые',
    image: 'assets/img/c5bf0ba1-c30f-48d6-9a2c-fdbafc9f8016-5431480.jpeg',
    shortDesc: 'Люксовые туреры BMW: R1200RT, R1250RT, K1600GT / GTL / Bagger, K1200LT, R1200ST.',
    fullDesc: 'Элитное сообщество владельцев туристических мотоциклов BMW. Тонкости 6-цилиндровых моторов K1600, оппозитников RT, обслуживание аудиосистем, электронных подвесок Dynamic ESA, ветрозащиты и комфортных сидений для поездок на 1500+ км в сутки («Жертва Нордкапа», «Iron Butt»).',
    modelsCovered: ['BMW R 1250 RT / R 1200 RT (LC)', 'BMW K 1600 GT / GTL / Grand America / Bagger', 'BMW K 1200 LT / K 1100 LT', 'BMW R 1200 ST / R 1150 RT'],
    keyTopics: ['Комфорт в сверхдальних путешествиях', 'Обслуживание 6-цилиндровых двигателей K1600', 'Интеграция гарнитур Sena/Cardo и навигации ConnectedRide', 'Регламент замены жидкостей и уход за пластиком'],
    rules: ['Культура общения', 'Обмен опытом дальних поездок', 'Без коммерческого спама'],
    telegramLink: 'https://t.me/bmwtourclub',
    estimatedMembers: 6400
  },

  // --- Китай и Питбайки ---
  {
    slug: 'bserus',
    username: 'BSErus',
    title: 'BSE Клуб Россия',
    brand: 'BSE',
    category: 'Брендовые',
    image: 'assets/img/496f8b9e-64d6-4e55-87d2-7c98cf85d95e-5431481.jpeg',
    shortDesc: 'Питбайки и эндуро мотоциклы BSE: Z1, Z2, Z3, Z5, Z7, Z8, RTC 300, EX 125.',
    fullDesc: 'Клуб фанатов китайской мототехники BSE. Доработка и форсирование моторов Zongshen (172FMM, 174MN, 177MM, 182MN), регулировка клапанов, замена стоковой подвески, настройка карбюраторов Nibbi Racing и выбор надежных цепей.',
    modelsCovered: ['BSE Z1 / Z2 / Z3 / Z4 / Z5 / Z6 / Z7 / Z8', 'BSE RTC 300 / RTC 250', 'BSE M2 / M4 / M8', 'BSE EX 125 / PH 125 / MX 125'],
    keyTopics: ['Настройка карбюраторов Nibbi Racing PE/PWK', 'Усиление рамы и замена подшипников прогрессии', 'Подбор кроссовой резины и буксаторов', 'Регулировка клапанных зазоров 172/174/177 моторов'],
    rules: ['Помощь новичкам без снобизма', 'Делимся проверенными продавцами с AliExpress/Ozon', 'Без мата'],
    telegramLink: 'https://t.me/BSErus',
    estimatedMembers: 7600
  },
  {
    slug: 'cfmotorus',
    username: 'CFMOTOrus',
    title: 'CFMOTO Клуб Россия',
    brand: 'CFMOTO',
    category: 'Брендовые',
    image: 'assets/img/678a15a0-07bf-4632-9dfc-59eb4f4c45b8-5431482.jpeg',
    shortDesc: 'Мотоциклы CFMOTO: 800MT, 700CL-X, 650MT, 450MT, 450SR, 300NK, 250NK.',
    fullDesc: 'Официальное и независимое сообщество владельцев флагманских мотоциклов CFMOTO. Реальный опыт эксплуатации моторов KTM (LC8c в 800MT), прошивка блоков управления, подбор масел, установка кофров и решение детских болячек.',
    modelsCovered: ['CFMOTO 800MT (Sport / Touring / Explore)', 'CFMOTO 450MT / 450SR / 450NK', 'CFMOTO 700CL-X (Heritage / Sport / Adventure)', 'CFMOTO 650MT / 650GT / 650NK', 'CFMOTO 800NK'],
    keyTopics: ['Опыт гарантийного обслуживания у дилеров', 'Прошивки ЭБУ и отключение задушек', 'Сравнение 800MT с европейскими и японскими одноклассниками', 'Дооснащение для туризма (защита, кофры, свет)'],
    rules: ['Конструктивные отзывы', 'Уважение к выбору техники', 'Без спама'],
    telegramLink: 'https://t.me/CFMOTOrus',
    estimatedMembers: 8900
  },
  {
    slug: 'kayoclub',
    username: 'kayoclub',
    title: 'KAYO Клуб Россия',
    brand: 'KAYO',
    category: 'Брендовые',
    image: 'assets/img/d618d363-d34e-48a5-9b2f-da541bc8782a-5431483.jpeg',
    shortDesc: 'Питбайки, кросс и эндуро KAYO: T2, T4, K1, K4, K6, KT250, Basic, TT125, TT140.',
    fullDesc: 'Одно из самых массовых эндуро-сообществ России. Обслуживание народных мотоциклов KAYO T2 Enduro, K1, K4, переборка вилок FastAce, замена масла в амортизаторах, тюнинг карбюраторов и покатушки по хард-эндуро трассам.',
    modelsCovered: ['KAYO T2 250 Enduro / T4 / T6', 'KAYO K1 250 MX / K2 / K4 / K6-R', 'KAYO KT 250 (2-тактный)', 'KAYO Basic YX125 / TT125 / TT140 / Evolution'],
    keyTopics: ['Протяжка спиц и правильная затяжка соединений', 'Замена стоковой цепи на сальниковую 520 (DID, SFR)', 'Ремонт электростартера и обгонной муфты', 'Настройка жесткости подвески под вес райдера'],
    rules: ['Делись фото покатушек и техническими решениями', 'Без оскорблений', 'Помогай начинающим эндуристам'],
    telegramLink: 'https://t.me/kayoclub',
    estimatedMembers: 11400
  },

  // --- Honda ---
  {
    slug: 'hondacbrus',
    username: 'hondacbrus',
    title: 'Honda CB Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/32d03fa6-b1cb-4df6-8ff4-dd5d2630a9ce-5431484.jpeg',
    shortDesc: 'Легендарные классики Honda CB: CB400 Super Four, CB600 Hornet, CB750, CB1000R, CB1100, CB1300.',
    fullDesc: 'Клуб почитателей вечной классики японского мотопрома. Тонкости синхронизации 4 карбюраторов Keihin на CB400SF, настройка системы VTEC, подбор мембран, выбор расходников и продление ресурса двигателей-миллионников Honda CB.',
    modelsCovered: ['Honda CB 400 SF (Super Four / Hyper VTEC I-III, Revo)', 'Honda CB 600 F Hornet / CB 650 R', 'Honda CB 1300 Super Four / Super Boldor', 'Honda CB 750 (Seven Fifty)', 'Honda CB 1000 R / CB 1100'],
    keyTopics: ['Синхронизация карбюраторов и замена манифолдов (впускных патрубков)', 'Работа системы Hyper VTEC и регулировка клапанов', 'Замена цепи ГРМ и натяжителя', 'Выбор масляных фильтров и мотомасел'],
    rules: ['Бережное отношение к классической технике', 'Без флуда и токсичности', 'Опыт ремонта приветствуется'],
    telegramLink: 'https://t.me/hondacbrus',
    estimatedMembers: 12800
  },
  {
    slug: 'hondacbrrus',
    username: 'hondacbrrus',
    title: 'Honda CBR Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/bb7cb560-6712-42fe-adba-57fd5c3fa5c0-5431485.jpeg',
    shortDesc: 'Спортбайки Honda CBR: CBR600RR, CBR1000RR Fireblade, CBR600F4i, CBR900RR, CBR1100XX Blackbird.',
    fullDesc: 'Сообщество пилотов спортивной линейки CBR и легендарного гипертурера Blackbird («Дрозд»). Подготовка байков к треку, настройка спортивных подвесок Showa/Öhlins, демпферы HESD, замена натяжителя ГРМ и подбор трековых колодок.',
    modelsCovered: ['Honda CBR 1000 RR Fireblade / SP', 'Honda CBR 600 RR (PC37, PC40)', 'Honda CBR 600 F4i / F4 / F3', 'Honda CBR 1100 XX Super Blackbird', 'Honda CBR 929 RR / 954 RR'],
    keyTopics: ['ГРМ и замена автоматического натяжителя', 'Спортивная посадка и демпфер руля HESD', 'Подготовка к трек-дням: тормоза, армированные шланги, прогрев резины', 'Электрика и реле-регулятор генератора'],
    rules: ['Безопасность на дорогах и треке', 'Без троллинга', 'Только проверенные технические советы'],
    telegramLink: 'https://t.me/hondacbrrus',
    estimatedMembers: 10900
  },
  {
    slug: 'hondaglrus',
    username: 'hondaglrus',
    title: 'Honda Gold Wing Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/5b55e88a-df5c-4a37-b452-f67e584f09a5-5431486.jpeg',
    shortDesc: 'Королевские туреры Honda Gold Wing: GL1800 (2001-2017), New GL1800 (2018+ DCT), GL1500, F6B.',
    fullDesc: 'Крупнейший клуб владельцев «Голды». 6-цилиндровые оппозиты, коробка передач с двойным сцеплением DCT, установка кастомной акустики, навигация, пневмоподвеска, прицепы и подготовка к трансконтинентальным мотопутешествиям.',
    modelsCovered: ['Honda GL 1800 Gold Wing (2018+ DCT / Tour)', 'Honda GL 1800 Gold Wing (2001–2017)', 'Honda GL 1500 (1988–2000)', 'Honda F6B Bagger / F6C Valkyrie'],
    keyTopics: ['Особенности работы и обслуживания коробки DCT', 'Тюнинг автозвука и дополнительной светотехники', 'Обслуживание передней рычажной подвески (2018+)', 'Организация всероссийских Голдослетов'],
    rules: ['Высокая культура общения', 'Помощь одноклубникам в путешествиях', 'Без коммерческого спама'],
    telegramLink: 'https://t.me/hondaglrus',
    estimatedMembers: 8400
  },
  {
    slug: 'steedrus',
    username: 'SteedRus',
    title: 'Honda Steed Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/282ad76a-c215-46b0-9515-b541334c22fe-5431487.jpeg',
    shortDesc: 'Неубиваемые чопперы Honda Steed (VLX 400 / 600, VSE, VLS, Shadow 400).',
    fullDesc: 'Культовый клуб владельцев Honda Steed. Простейшие надежные V-образные моторы, кастомизация в стиле боббер/чоппер, изготовление прямотоков, замена мембран карбюраторов, поиск редких запчастей и переспицовка колес.',
    modelsCovered: ['Honda Steed 400 (VLX / VCL / VSE / VLS)', 'Honda Steed 600 (VT600C Shadow VLX)', 'Honda Shadow 400 / 750 (VT400 / VT750)'],
    keyTopics: ['Кастомизация в боббер (спрингер, соло-седло, кастомные крылья)', 'Очистка и настройка двух карбюраторов Keihin', 'Замена цепи и звезд: подбор передаточного числа для трассы', 'Регулировка клапанов винтами (без шайб)'],
    rules: ['Уважение к олдскулу и кастом-культуре', 'Делимся чертежами и мануалами', 'Без спама'],
    telegramLink: 'https://t.me/SteedRus',
    estimatedMembers: 9200
  },
  {
    slug: 'hondarebel',
    username: 'HondaRebel',
    title: 'Honda Rebel Club (CMX 300 / 500 / 1100)',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/842e4ec3-d5d1-4ba2-bfce-43ca2fa9db81-5431488.jpeg',
    shortDesc: 'Современные нео-круизеры Honda Rebel: CMX 300, CMX 500, CMX 1100 DCT.',
    fullDesc: 'Сообщество владельцев стильных круизеров новой волны Honda Rebel. Моторы от Africa Twin на Rebel 1100, режимы езды, автоматические коробки DCT, доработка сидений для комфорта и установка выхлопов Vance & Hines / Miller.',
    modelsCovered: ['Honda CMX 1100 Rebel (MT / DCT)', 'Honda CMX 500 Rebel (Special Edition)', 'Honda CMX 300 / Rebel 250'],
    keyTopics: ['Замена штатного жесткого седла на комфортное', 'Обслуживание коробки передач DCT', 'Установка ветровиков и боковых сумок (Hepco&Becker, SW-Motech)', 'Выбор прямоточных выхлопных систем'],
    rules: ['Дружелюбная атмосфера', 'Без оффтопа', 'Помощь новичкам'],
    telegramLink: 'https://t.me/HondaRebel',
    estimatedMembers: 5900
  },
  {
    slug: 'varaderorus',
    username: 'VaraderoRus',
    title: 'Honda Varadero & Transalp Club',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/14352eb9-4aa8-4447-aa1c-0c151fb78926-5431489.jpeg',
    shortDesc: 'Турэндуро Honda: XL1000V Varadero, Transalp (XL600V, XL650V, XL700V, XL750).',
    fullDesc: 'Клуб покорителей любых дорог на турерах Honda с моторами V-Twin. Обслуживание топливного насоса и реле-регулятора на Варадеро, замена шлицов вторичного вала на Трансальпе, выбор усиленных защитных дуг и подготовка к Памирскому тракту.',
    modelsCovered: ['Honda XL1000V Varadero (Карбюратор / Инжектор)', 'Honda XL 750 Transalp (2023+)', 'Honda XL 700 V Transalp', 'Honda XL 650 V / XL 600 V Transalp', 'Honda XRV 750 Africa Twin'],
    keyTopics: ['Ресурс бензонасоса и замена на вакуумный / диодный контактор', 'Защита вторичного вала от износа (звезды KK-Bike / SuperSprox)', 'Настройка подвески и прогрессии для двоих с багажом', 'Маршруты по Кавказу и Средней Азии'],
    rules: ['Туристическое братство', 'Обмен картами и треками', 'Без спама'],
    telegramLink: 'https://t.me/VaraderoRus',
    estimatedMembers: 7300
  },
  {
    slug: 'hondavfrclub',
    username: 'hondavfrclub',
    title: 'Honda VFR Клуб (V4 Interceptor)',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/4ea0f666-8968-45dc-a2c6-3ea66a3d9052-5431490.jpeg',
    shortDesc: 'Легендарные спорт-туристы с мотором V4: VFR800 (Fi / VTEC / Crossrunner), VFR1200F / Crosstourer, VFR750.',
    fullDesc: 'Сообщество ценителей уникальных двигателей V4 и консольного маятника Honda. Шестеренчатый привод ГРМ на VFR800 Fi (RC46-1), регулировка зазоров клапанов на системе VTEC, обслуживание консоли и кардана на VFR1200.',
    modelsCovered: ['Honda VFR 800 Fi (RC46-I, шестерни ГРМ)', 'Honda VFR 800 VTEC (RC46-II, Crossrunner)', 'Honda VFR 1200 F / Crosstourer (DCT / MT)', 'Honda VFR 750 F (RC36-I / RC36-II)'],
    keyTopics: ['Особенности регулировки клапанов VTEC', 'Реле-регулятор и термостойкая проводка генератора', 'Обслуживание консольного маятника и ступичного узла', 'Комбинированная тормозная система Dual-CBS'],
    rules: ['Глубокие технические знания', 'Уважение к соклубникам', 'Без флуда'],
    telegramLink: 'https://t.me/hondavfrclub',
    estimatedMembers: 6800
  },
  {
    slug: 'hondavtx',
    username: 'hondavtx',
    title: 'Honda VTX & VT Shadow Club',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/a04a6011-ddcc-4089-a299-1a48698ee09f-5431491.jpeg',
    shortDesc: 'Могучие пауэр-круизеры Honda VTX 1800, VTX 1300, Shadow 750 / 1100, Fury.',
    fullDesc: 'Клуб любителей монументальных V-образных двигателей объемом до 1.8 литра. Обсуждение паровозного крутящего момента VTX 1800, обслуживание кардана, демпферов сцепления, клапана холостого хода, выбор тюнинга и шин шириной 200–240 мм.',
    modelsCovered: ['Honda VTX 1800 (C / R / S / N / F / T)', 'Honda VTX 1300 (Custom / Retro)', 'Honda VT 1300 CX Fury / Stateline / Sabre', 'Honda Shadow VT 1100 / VT 750'],
    keyTopics: ['Свечи зажигания и катушки на VTX1800', 'Замена сайлентблоков амортизаторов и втулок маятника', 'Обслуживание карданной передачи и крестовины', 'Установка широкого заднего колеса и кастомных выхлопов (Cobra, Vance & Hines)'],
    rules: ['Спокойное и уважительное общение', 'Байкерские традиции', 'Без спама'],
    telegramLink: 'https://t.me/hondavtx',
    estimatedMembers: 8700
  },

  // --- Kawasaki ---
  {
    slug: 'er6club',
    username: 'er6club',
    title: 'Kawasaki ER-6 & Ninja 650 Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/264b38d3-0599-4c57-a1dc-27485098b671-5431492.jpeg',
    shortDesc: 'Городские стритфайтеры и спорт-туристы: ER-6n, ER-6f, Ninja 650, Versys 650, Z650.',
    fullDesc: 'Самый популярный чат по 2-цилиндровым рядным шестисоткам Kawasaki. Регулировка клапанов, замена натяжителя ГРМ, особенности крепления правого бокового моноамортизатора, установка слайдеров и решение проблемы с обрывом выпускных клапанов на старых ревизиях.',
    modelsCovered: ['Kawasaki ER-6n / ER-6f (2006–2016)', 'Kawasaki Ninja 650 / Z650 (2017+)', 'Kawasaki Versys 650 (KLE650)', 'Kawasaki Vulcan S 650 (EN650)'],
    keyTopics: ['Проверка зазоров клапанов каждые 24 000 км', 'Установка клеток Crazy Iron / Armor Bike для джимаханы', 'Замена тормозных дисков и прокачка ABS', 'Подбор масла для 2-цилиндрового мотора'],
    rules: ['Дружеская атмосфера', 'Помощь новичкам в джимхане и городе', 'Без рекламы'],
    telegramLink: 'https://t.me/er6club',
    estimatedMembers: 8100
  },
  {
    slug: 'kleclub',
    username: 'kleclub',
    title: 'Kawasaki KL / KLE / KLR / KLX Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/83726917-f6cf-448f-aa66-f84db02641a2-5431493.jpeg',
    shortDesc: 'Универсальные эндуро и турэндуро: KLE 250 / 400 / 500, KLR 650, KLX 250 / 300, Super Sherpa.',
    fullDesc: 'Клуб ценителей неубиваемых дуал-спортов Kawasaki. Доработка успокоителя балансирного вала («Doo-Hickey») на KLR650, переборка карбюраторов на KLE500, форсирование и раздушка инжекторного KLX250, автономные экспедиции по бездорожью.',
    modelsCovered: ['Kawasaki KLR 650 (Gen 1, Gen 2, Gen 3 2022+)', 'Kawasaki KLE 500 / KLE 400 / KLE 250 Anhelo', 'Kawasaki KLX 250 / D-Tracker / KLX 300', 'Kawasaki Super Sherpa (KL250)'],
    keyTopics: ['Замена Doohickey на KLR650 (Eagle Mike)', 'Увеличение объема бака (баки IMS, Acerbis)', 'Регулировка карбюраторов Keihin CVK', 'Внедорожный тюнинг и защита картера'],
    rules: ['Эндуро-братство', 'Делимся треками и местами ночевок', 'Без спама'],
    telegramLink: 'https://t.me/kleclub',
    estimatedMembers: 6300
  },
  {
    slug: 'zzrrus',
    username: 'ZZRrus',
    title: 'Kawasaki ZZR & Ninja Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/c6655c65-ea9e-49b8-b19b-c40d1279a0ce-5431494.jpeg',
    shortDesc: 'Сверхскоростные спорт-туристы: ZZR 400, ZZR 600, ZZR 1100, ZZR 1200, ZZR 1400 (ZX-14R).',
    fullDesc: 'Легендарное сообщество «Зизероводов». Решение классической проблемы вылета второй передачи на ZZR400/1100, настройка системы инерционного наддува RAM-Air, синхронизация карбюраторов и колоссальная мощь ZZR 1400 на автобанах.',
    modelsCovered: ['Kawasaki ZZR 1400 / ZX-14R Ninja', 'Kawasaki ZZR 400 (I / II поколение)', 'Kawasaki ZZR 1100 (ZX-11) / ZZR 1200', 'Kawasaki ZZR 600 (ZX-6E)', 'Kawasaki ZX-10R / ZX-6R Ninja'],
    keyTopics: ['Лечение и переборка коробки передач (шестерни 2 передачи и копирный вал)', 'Настройка и герметизация системы RAM-Air', 'Улучшение охлаждения и замена помпы', 'Выбор высокоскоростной резины (W/Y индекс)'],
    rules: ['Техническая грамотность', 'Взаимопомощь запчастями с разборок', 'Без мата'],
    telegramLink: 'https://t.me/ZZRrus',
    estimatedMembers: 9500
  },
  {
    slug: 'ridersvulcan',
    username: 'RidersVulcan',
    title: 'Kawasaki Vulcan Riders Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/67bafe67-ef1e-450b-9ffb-5b5840dca449-5431495.jpeg',
    shortDesc: 'Круизеры Kawasaki Vulcan: VN400, VN800, VN900, VN1500, VN1600, VN1700, VN2000.',
    fullDesc: 'Российское сообщество владельцев легендарных круизеров Vulcan. Самый большой серийный 2-цилиндровый двигатель в мире (2053 куб.см на VN2000), ременные и карданные передачи, пластиковая шестерня масляного насоса на VN1500 (POG), комфортные кофры и кастомные рули.',
    modelsCovered: ['Kawasaki VN 2000 (Vulcan 2 Litre)', 'Kawasaki VN 1700 (Voyager / Vaquero / Classic)', 'Kawasaki VN 900 (Classic / Custom)', 'Kawasaki VN 1500 / 1600 (Mean Streak / Nomad)', 'Kawasaki VN 400 / VN 800 Drifter / Classic'],
    keyTopics: ['Замена пластиковой шестерни маслонасоса (JOG) на металлическую (VN1500)', 'Ресурс и натяжка приводного ремня на VN900/1700/2000', 'Установка кастомных рулей Ape Hanger с удлинением тросов', 'Обслуживание инжектора и топливного фильтра в баке'],
    rules: ['Байкерское братство и взаимовыручка', 'Без оффтопа', 'Делись опытом кастомизации'],
    telegramLink: 'https://t.me/RidersVulcan',
    estimatedMembers: 7800
  },

  // --- KTM ---
  {
    slug: 'dukerus',
    username: 'dukerus',
    title: 'KTM Duke & Adventure Club',
    brand: 'KTM',
    category: 'Брендовые',
    image: 'assets/img/1bb2d580-281b-4fc6-b258-fce59160d5b3-5431496.jpeg',
    shortDesc: 'Австрийские хулиганы: Duke 125/200/250/390/690/790/890/1290 Super Duke R, 390/790/890/1290 Adventure.',
    fullDesc: 'Клуб любителей оранжевого безумия «Ready to Race». Тонкости моторов LC4 и LC8, двухсторонний квикшифтер Quickshifter+, подвески WP Apex/Pro, контроль давления масла, прошивки блоков управления и устранение течей сальников помпы.',
    modelsCovered: ['KTM 1290 Super Duke R / GT / Super Adventure R/S', 'KTM 790 / 890 Duke & Adventure (R / Rally)', 'KTM 390 Duke / 390 Adventure / RC 390', 'KTM 690 SMC R / Enduro R'],
    keyTopics: ['Диагностика через KTM XC-1 / OBD2 адаптеры', 'Обслуживание и замена масла в вилках WP Apex', 'Настройка трекшн-контроля (MTC) и анти-вилли', 'Усиление защиты картера и крышек двигателя'],
    rules: ['Драйв, спорт и взаимопомощь', 'Без токсичности', 'Только качественный технический контент'],
    telegramLink: 'https://t.me/dukerus',
    estimatedMembers: 8900
  },

  // --- Suzuki ---
  {
    slug: 'gsfclub',
    username: 'gsfclub',
    title: 'Suzuki Bandit GSF Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/d80f8365-24c7-43cf-be76-0bf85be52427-5431497.jpeg',
    shortDesc: 'Культовые нейкеды и спорт-туристы Suzuki Bandit: GSF 250, 400, 600, 650, 750, 1200, 1250.',
    fullDesc: 'Одно из старейших сообществ Рунета. Легендарные моторы масляно-воздушного охлаждения SACS («воздушно-масляные»), невероятный крутящий момент Bandit 1200/1250, настройка карбюраторов Mikuni BST, замена цепей ГРМ и регулировка клапанов.',
    modelsCovered: ['Suzuki GSF 1200 / 1250 Bandit (N / S)', 'Suzuki GSF 600 / 650 Bandit', 'Suzuki GSF 400 Bandit (Красноголовый / Сероголовый)', 'Suzuki GSF 750 / GSX 1250 FA'],
    keyTopics: ['Регулировка клапанов винтами и шайбами', 'Чистка и синхронизация карбюраторов Mikuni/Keihin', 'Установка вилки и маятника от GSX-R для лучшей управляемости', 'Продление ресурса моторов SACS'],
    rules: ['Уважение к традициям Бандит-клуба', 'Помощь запчастями и мануалами', 'Без спама'],
    telegramLink: 'https://t.me/gsfclub',
    estimatedMembers: 11800
  },
  {
    slug: 'djebelrus',
    username: 'DjebelRus',
    title: 'Suzuki Djebel & DR-Z Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/32c1c691-12f5-4424-81e8-78c77aa7621c-5431498.jpeg',
    shortDesc: 'Легендарные внедорожники: Djebel 200 / 250 XC, DR-Z 400 (S / SM / E), DR 650 SE, DR 250.',
    fullDesc: 'Клуб фанатов надежных японских эндуро с огромной фарой-«прожектором» и баком на 17 литров. Обслуживание моторов с системой масляного радиатора, настройка вакуумных карбюраторов TM28/BSR32, замена цепи ГРМ на DR-Z 400 и подготовка к автономным таежным походам.',
    modelsCovered: ['Suzuki Djebel 250 XC / GPS Ver (SJ45A)', 'Suzuki DR-Z 400 S / SM / E', 'Suzuki DR 650 SE', 'Suzuki Djebel 200 (SH42A) / DR 200 Trojan'],
    keyTopics: ['Замена цепи ГРМ и декомпрессора', 'Настройка и ремонт ускорительного насоса карбюратора', 'Снятие и обслуживание подшипников прогрессии и маятника', 'Организация автономных экспедиций по Сибири, Кольскому и Кавказу'],
    rules: ['Эндуро-взаимовыручка', 'Делимся треками и координатами стоянок', 'Без коммерции'],
    telegramLink: 'https://t.me/DjebelRus',
    estimatedMembers: 8200
  },
  {
    slug: 'gsxrclub',
    username: 'gsxrclub',
    title: 'Suzuki GSX-R & Hayabusa Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/4f8ee96f-c1f9-4ae3-9d04-0c5a0ec7b985-5431464.jpeg',
    shortDesc: 'Спортбайки и гипербайки: GSX-R 600, GSX-R 750, GSX-R 1000, GSX1300R Hayabusa.',
    fullDesc: 'Клуб любителей адреналина и скорости. Могучая Хаябуса, эталонные Джиксеры GSX-R750, настройка системы впрыска SDTV, выхлопы Yoshimura, титановые клапаны, прошивка ЭБУ (Woolich Racing) и трековые заезды.',
    modelsCovered: ['Suzuki GSX1300R Hayabusa (Gen 1, Gen 2, Gen 3)', 'Suzuki GSX-R 1000 (K1–L9, R)', 'Suzuki GSX-R 750 / GSX-R 600 (SRAD, K4–L8)', 'Suzuki GSX-S 750 / GSX-S 1000 / Katana'],
    keyTopics: ['Прошивка мозгов и снятие ограничителя скорости 300 км/ч', 'Регулировка клапана выпускной системы SET (Exup)', 'Установка радиальных тормозных машинок Brembo/Nissin', 'Выбор сликов и полусликов для трека'],
    rules: ['Дисциплина и экипировка', 'Трековые тренировки', 'Без флуда'],
    telegramLink: 'https://t.me/gsxrclub',
    estimatedMembers: 9700
  },
  {
    slug: 'boulevardrus',
    username: 'BoulevardRus',
    title: 'Suzuki Intruder & Boulevard Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/7a7fc7dc-faee-4a8a-9e1b-4c40590a36e5-5431465.jpeg',
    shortDesc: 'Пауэр-круизеры и чопперы Suzuki: M109R / VZR1800, C109R, C90 / M90 / VL1500, C50 / M50 / VL800, VS400/800/1400.',
    fullDesc: 'Сообщество владельцев мускулистых круизеров Suzuki Boulevard и Intruder. Знаменитый M109R с задним катком 240 мм, обслуживание сцепления, замена демпферов заднего колеса, карданный вал, установка пневмоподвесок и прямотоков Cobra / Hard Krome.',
    modelsCovered: ['Suzuki Boulevard M109R / Intruder M1800R (VZR1800)', 'Suzuki Boulevard C109R / Intruder C1800R (VLR1800)', 'Suzuki Boulevard C90 / M90 / Intruder 1500 (VL1500 / VZ1500)', 'Suzuki Boulevard C50 / M50 / Intruder 800 (VL800 / VZ800)', 'Suzuki Intruder VS 1400 / VS 800 / VS 400'],
    keyTopics: ['Усиление корзины сцепления на M109R', 'Замена заднего баллона на 260/280 мм', 'Синхронизация дроссельных заслонок инжектора', 'Установка дуг безопасности и кофров'],
    rules: ['Байкерское уважение', 'Делись опытом обслуживания гигантов', 'Без спама'],
    telegramLink: 'https://t.me/BoulevardRus',
    estimatedMembers: 8600
  },
  {
    slug: 'skywaveclub',
    username: 'SkywaveClub',
    title: 'Suzuki Skywave / Burgman Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/c57c4c34-eb17-48f5-b384-eb05e8fb7fa4-5431466.jpeg',
    shortDesc: 'Максискутеры бизнес-класса: Skywave / Burgman 250, 400, 650 (Executive).',
    fullDesc: 'Крупнейший клуб любителей максимального комфорта в городе и путешествиях. Электронный вариатор SECVT на Burgman 650 (замена шестерен и ремня), уход за сцеплением Burgman 400, подогревы сидений и ручек, огромные багажные объемы на 2 шлема.',
    modelsCovered: ['Suzuki Burgman / Skywave 650 (Executive, SECVT)', 'Suzuki Burgman / Skywave 400 (AN400, Type S)', 'Suzuki Burgman / Skywave 250 (CJ43A, CJ44A, CJ46A)'],
    keyTopics: ['Диагностика вариатора SECVT (болт-фиксатор, шестерни)', 'Замена грузиков и ремня вариатора (Malossi, Dr.Pulley, Bando)', 'Обслуживание стояночного тормоза и тросов', 'Дальние путешествия на максискутерах'],
    rules: ['Уважение к скутерному движению', 'Помощь в поиске деталей вариатора', 'Без спама'],
    telegramLink: 'https://t.me/SkywaveClub',
    estimatedMembers: 6700
  },
  {
    slug: 'vstromrus',
    username: 'VStromRus',
    title: 'Suzuki V-Strom Club Russia',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/b8221b2d-1ea3-4cf1-97ba-2caeb4bf58ec-5431476.jpeg',
    shortDesc: 'Универсальные турэндуро: V-Strom 650 (DL650), V-Strom 1000 (DL1000), V-Strom 800DE, V-Strom 1050.',
    fullDesc: 'Клуб неутомимых путешественников на V-Strom («Стромоводы»). Неубиваемый 650-кубовый V-Twin от SV650, новый параллельный твин 800DE с 21-м колесом, устранение вибраций корзины сцепления на литре («chudder»), установка высокого стекла и защит картера.',
    modelsCovered: ['Suzuki DL 650 V-Strom (XT / Explorer)', 'Suzuki DL 1000 / DL 1050 V-Strom (XT)', 'Suzuki V-Strom 800DE / 800', 'Suzuki V-Strom 250 / 250SX'],
    keyTopics: ['Лечение вибрации корзины сцепления (ShareDecks / модификация)', 'Подбор ветрового стекла и дефлекторов (Givi Airflow, Madstad)', 'Настройка подвески под полную загрузку кофрами', 'Маршруты по Грузии, Турции, Алтаю и Карелии'],
    rules: ['Путешествия превыше всего', 'Делимся треками и проверенными сервисами', 'Без политики'],
    telegramLink: 'https://t.me/VStromRus',
    estimatedMembers: 8400
  },

  // --- Yamaha ---
  {
    slug: 'yamahastarrus',
    username: 'YamahaStarRus',
    title: 'Yamaha Star Club Russia',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/842e4ec3-d5d1-4ba2-bfce-43ca2fa9db81-5431488.jpeg',
    shortDesc: 'Круизеры Yamaha Star: DragStar 400/650/1100, Royal Star 1300, Road Star 1600/1700, Raider 1900, Stratoliner, Bolt 950.',
    fullDesc: 'Крупнейшее сообщество владельцев круизеров линейки Star в СНГ. Тонкости обслуживания обгонной муфты на DragStar 1100, снятие заднего колеса и смазка кардана на DragStar 400/650, могучий 1.9-литровый мотор Raider 1900, кастом-проекты на базе Yamaha Bolt.',
    modelsCovered: ['Yamaha DragStar 400 / 650 / 1100 (XVS Custom / Classic)', 'Yamaha XV1900 Raider / Stratoliner / Roadliner', 'Yamaha XV1600 / XV1700 Road Star / Wild Star', 'Yamaha XVZ1300 Royal Star / Venture', 'Yamaha XV950 Bolt / SCR950'],
    keyTopics: ['Замена и усиление обгонной муфты (DragStar 1100)', 'Смазка шлицевых соединений кардана спецсмазкой с дисульфидом молибдена', 'Установка прямотоков Cobra/Vance & Hines и перепрошивка ЭБУ/Power Commander', 'Выбор кофров, ветровиков и хромированного тюнинга'],
    rules: ['Байкерское братство', 'Взаимопомощь на трассе', 'Без коммерческого спама'],
    telegramLink: 'https://t.me/YamahaStarRus',
    estimatedMembers: 13900
  },
  {
    slug: 'yamahafazerclub',
    username: 'YamahaFazerClub',
    title: 'Yamaha Fazer & MT Club',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/b8221b2d-1ea3-4cf1-97ba-2caeb4bf58ec-5431476.jpeg',
    shortDesc: 'Спортивно-городские мотоциклы: FZ400, FZ6 (N / S / S2), FZ1, FZ8, MT-07, MT-09, MT-10.',
    fullDesc: 'Клуб владельцев универсальных стритфайтеров и спорт-туристов Yamaha. Двигатели от R6 и R1 в дружелюбном шасси, демпфер сцепления FZ6, ротор генератора на FZ1 (отклеивание магнитов и замена на цельнометаллический), 3-цилиндровый Crossplane CP3 на MT-09.',
    modelsCovered: ['Yamaha FZ6 (FZ6-N, FZ6-S Fazer, S2)', 'Yamaha FZ1 (FZ1-N, FZ1-S Fazer 1000)', 'Yamaha FZ8 / Fazer8', 'Yamaha MT-07 / MT-09 / MT-10 (SP)', 'Yamaha FZ400 (4YR) / FZS600 / FZS1000'],
    keyTopics: ['Замена открытого ротора генератора на FZ1 на нового образца', 'Регулировка датчика положения дроссельной заслонки TPS (FZ6)', 'Настройка подвески для города и трека', 'Установка дуг и слайдеров двигателя'],
    rules: ['Дружеское общение', 'Помощь новичкам', 'Без мата и спама'],
    telegramLink: 'https://t.me/YamahaFazerClub',
    estimatedMembers: 11200
  },
  {
    slug: 'r1r6club',
    username: 'r1r6club',
    title: 'Yamaha YZF R1 & R6 Club',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/320bb269-83bc-42b7-a36c-2f98e578eb04-5431477.jpeg',
    shortDesc: 'Бескомпромиссные супербайки Yamaha: YZF-R6 (RJ03-RJ27), YZF-R1 (RN01-RN65 Crossplane CP4).',
    fullDesc: 'Сообщество пилотов спортивной элиты Yamaha. Легендарный звук крестообразного коленвала Crossplane CP4, подготовка R6 к кольцевым гонкам, настройка подвесок KYB/Öhlins, прошивка ЭБУ под полный выхлоп Akrapovič, титановые шатуны и телеметрия.',
    modelsCovered: ['Yamaha YZF-R1 Crossplane CP4 (2009–2024)', 'Yamaha YZF-R1 (1998–2008)', 'Yamaha YZF-R6 (RJ11, RJ15, RJ27)', 'Yamaha YZF-R7 / R3'],
    keyTopics: ['Подготовка к треку: тормоза Brembo RCS, армированные магистрали, грелки', 'Обслуживание клапанного механизма и замена цепи ГРМ', 'Настройка электроники: режимы мощности, Launch Control, анти-слайд', 'Устранение масложора на ранних версиях'],
    rules: ['Строгая безопасность', 'Экипировка на 100%', 'Без уличного неадеквата'],
    telegramLink: 'https://t.me/r1r6club',
    estimatedMembers: 9600
  },
  {
    slug: 'tenereclub',
    username: 'tenereclub',
    title: 'Yamaha Tenere Club (T7 / XT1200Z)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/14352eb9-4aa8-4447-aa1c-0c151fb78926-5431489.jpeg',
    shortDesc: 'Культовые ралли-рейдовые турэндуро: Tenere 700 (T7 / World Raid), Super Tenere 1200 (XT1200Z), XT660Z.',
    fullDesc: 'Клуб покорителей песков, бродов и каменистых перевалов. Тяговитый мотор CP2 на Tenere 700 без лишней электроники, карданный монументальный Super Tenere 1200 с баком на 30 литров, установка усиленных спицованных колес и раллийной навигации.',
    modelsCovered: ['Yamaha Tenere 700 (T7 / Rally / World Raid / Extreme)', 'Yamaha XT1200Z / XT1200ZE Super Tenere', 'Yamaha XT660Z Tenere / XT660R', 'Yamaha XTZ 750 Super Tenere'],
    keyTopics: ['Защита радиатора, помпы и картера для жесткого бездорожья', 'Усиление хвостовика рамы и багажные системы', 'Замена картриджей вилки и пружин заднего амортизатора', 'Маршруты по Дагестану, Монголии и Средней Азии'],
    rules: ['Раллийное братство', 'Делимся GPS-треками и точками эвакуации', 'Без флуда'],
    telegramLink: 'https://t.me/tenereclub',
    estimatedMembers: 7900
  },
  {
    slug: 'yamahatdmrus',
    username: 'YamahaTDMrus',
    title: 'Yamaha TDM Club Russia (850 / 900)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/31969ec6-89bf-4509-96cb-bb4df0894562-5431478.jpeg',
    shortDesc: 'Универсальные дорожные кроссоверы: TDM 850 (I / II) и TDM 900 (с инжектором и ABS).',
    fullDesc: 'Клуб почитателей одного из первых кроссоверов в истории мотостроения («Тыгыдым»). 2-цилиндровый рядник с сухим картером, замер уровня масла по мануалу, синхронизация инжектора TDM900, подбор передней резины 18 дюймов и комфорт на любых российских дорогах.',
    modelsCovered: ['Yamaha TDM 900 (RN08 / RN11 / RN18 с ABS)', 'Yamaha TDM 850-2 (4TX, 1996–2001)', 'Yamaha TDM 850-1 (3VD / 4CN, 1991–1995)', 'Yamaha TRX 850'],
    keyTopics: ['Правильный замер уровня масла на сухом картере (на горячую после 10 мин работы)', 'Синхронизация дросселей и регулировка клапана холостого хода', 'Переборка и замена эмульсионных трубок в карбюраторах Mikuni (TDM 850)', 'Подбор шин редкой размерности 120/70 ZR18'],
    rules: ['Взаимоуважение и помощь в поиске редких запчастей', 'Делимся мануалами', 'Без спама'],
    telegramLink: 'https://t.me/YamahaTDMrus',
    estimatedMembers: 8300
  },
  {
    slug: 'vmaxrus',
    username: 'VmaxRus',
    title: 'Yamaha V-Max Club (1200 / 1700)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/a04a6011-ddcc-4089-a299-1a48698ee09f-5431491.jpeg',
    shortDesc: 'Легендарные мускул-байки «Кувалда»: V-Max 1200 (V-Boost 145 л.с.) и VMAX 1700 (200 л.с.).',
    fullDesc: 'Культовое сообщество владельцев самого харизматичного пауэр-круизера в мире. Система наддува V-Boost, открывающаяся на 6000 об/мин, усиление гибкой рамы распорками, переборка 4 карбюраторов, могучий 1700-кубовый V4 с чип-тюнингом и неповторимый стиль.',
    modelsCovered: ['Yamaha V-Max 1200 (1985–2007, Full Power 145 hp / 2LT / 1FK)', 'Yamaha VMAX 1700 (2009–2020, 200 hp / RP21)'],
    keyTopics: ['Настройка сервопривода и синхронизация системы V-Boost', 'Усиление рамы (T-bars, subframe braces) и установка вилки от спортбайка', 'Обгонная муфта стартера и усиленные провода аккумулятора', 'Выбор широкого заднего колеса и тюнинг тормозов'],
    rules: ['Уважение к легенде V-Max', 'Без глупых споров о расходе топлива (он огромен!)', 'Взаимовыручка'],
    telegramLink: 'https://t.me/VmaxRus',
    estimatedMembers: 7500
  },
  {
    slug: 'clubxjr',
    username: 'clubxjr',
    title: 'Yamaha XJR & FJ Club (400 / 1200 / 1300)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/32d03fa6-b1cb-4df6-8ff4-dd5d2630a9ce-5431484.jpeg',
    shortDesc: 'Классические масл-байки с воздушным охлаждением: XJR 400, XJR 1200, XJR 1300 (SP), FJ 1200.',
    fullDesc: 'Клуб почитателей монументальных 4-цилиндровых «воздушников» Yamaha с двумя амортизаторами Öhlins. Обслуживание карбюраторов, замена цепи генератора и ГРМ, подбор масла для высокотемпературных режимов и классический японский стиль.',
    modelsCovered: ['Yamaha XJR 1300 / XJR 1300 SP (Карбюратор / Инжектор)', 'Yamaha XJR 1200 (4PU)', 'Yamaha XJR 400 (4HM / RH02J)', 'Yamaha FJ 1200 / FJ 1100'],
    keyTopics: ['Регулировка тепловых зазоров клапанов шайбами', 'Замена впускных патрубков манифолдов (борьба с подсосом воздуха)', 'Обслуживание задних амортизаторов Öhlins', 'Выбор масел с высокой термостабильностью'],
    rules: ['Любовь к классическим масл-байкам', 'Без коммерческого спама', 'Помощь соклубникам'],
    telegramLink: 'https://t.me/clubxjr',
    estimatedMembers: 6200
  },
  {
    slug: 'diversionclub',
    username: 'diversionclub',
    title: 'Yamaha Diversion & XJ6 Club',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/264b38d3-0599-4c57-a1dc-27485098b671-5431492.jpeg',
    shortDesc: 'Надежные и дружелюбные дорожные мотоциклы: XJ6 (N / Diversion / F), XJ 600 S/N, XJ 900 Diversion.',
    fullDesc: 'Сообщество владельцев идеальных мотоциклов для города и начинающих райдеров. Плавный и эластичный 4-цилиндровый мотор от FZ6, карданный привод на XJ 900, установка центральных кофров, регулировка сцепления и высокий комфорт.',
    modelsCovered: ['Yamaha XJ6 Diversion / XJ6-N / XJ6-F (2009–2016)', 'Yamaha XJ 600 S Diversion / XJ 600 N (1992–2003)', 'Yamaha XJ 900 S Diversion (Кардан)'],
    keyTopics: ['Замена масла, фильтров и свечей зажигания', 'Установка дуг безопасности и ветровых стекол повышенного комфорта', 'Обслуживание карданной передачи на XJ 900', 'Выбор резины для комфортных ежедневных поездок'],
    rules: ['Дружелюбная атмосфера', 'Помощь новичкам без снобизма', 'Без рекламы'],
    telegramLink: 'https://t.me/diversionclub',
    estimatedMembers: 4600
  },

  // --- Снегоходы ---
  {
    slug: 'brpsnow',
    username: 'BRPsnow',
    title: 'Снегоходы BRP Club (Ski-Doo & Lynx)',
    brand: 'BRP',
    category: 'Снегоходы',
    image: 'assets/img/93b2a2e4-964a-43ae-b69a-6663f733fcfd-5431499.jpeg',
    shortDesc: 'Горные, утилитарные и кроссоверные снегоходы BRP: Summit, Freeride, Boondocker, Commander, Expedition.',
    fullDesc: 'Крупнейший всероссийский клуб снегоходчиков BRP (Ski-Doo & Lynx). 2-тактные моторы Rotax 850 E-TEC (Turbo) и 4-тактные 900 ACE Turbo, задняя подвеска tMotion / PPS, бундокинг в горах Приискового, Хибин и Ергак, смазка склизов и вариатора pDrive.',
    modelsCovered: ['Ski-Doo Summit X / Expert (850 E-TEC Turbo)', 'Ski-Doo Freeride / Renegade / MXZ', 'Lynx Boondocker / Shredder / Rave', 'Lynx Commander / 59 Ranger / 69 Ranger', 'Ski-Doo Expedition SE / LE'],
    keyTopics: ['Настройка вариатора pDrive и выбор ремня', 'Масло BRP XPS 2T/4T и сохранение ресурса двигателя', 'Установка датчиков температуры и прямотоков', 'Организация снегоходных экспедиций и лавинная безопасность'],
    rules: ['Безопасность в горах и лавинное снаряжение (бипер, щуп, лопата)', 'Уважение', 'Делимся проверенным сервисом'],
    telegramLink: 'https://t.me/BRPsnow',
    estimatedMembers: 6900
  },
  {
    slug: 'polarissnow',
    username: 'PolarisSnow',
    title: 'Снегоходы Polaris Club Russia',
    brand: 'Polaris',
    category: 'Снегоходы',
    image: 'assets/img/382e70e3-df81-4475-ae0d-d4212ec8448f-5431500.jpeg',
    shortDesc: 'Горные и утилитарные снегоходы Polaris: RMK, PRO-RMK, Khaos (Matryx 850 / 9R / Patriot Boost), Titan, Indy, Widetrak.',
    fullDesc: 'Сообщество райдеров снегоходов Polaris. Новейшие платформы Matryx с моторами Patriot 850, 9R и Patriot Boost, сверхлегкие горники PRO-RMK Khaos с гусеницами 155/165/175, неубиваемый утилитарник Titan 800 и классический Widetrak IQ.',
    modelsCovered: ['Polaris PRO-RMK Khaos 850 / 9R / Boost (Matryx)', 'Polaris Titan XC / SP / Adventure 800', 'Polaris Indy / Switchback / Voyageur', 'Polaris 600 / 800 RMK', 'Polaris Widetrak LX / IQ'],
    keyTopics: ['Обслуживание ременного привода QuickDrive', 'Масло Polaris VES Extreme', 'Усиление рычагов и бамперов (STS, Voevoda)', 'Горное катание и преодоление склонов'],
    rules: ['Только проверенная техническая информация', 'Лавинная безопасность', 'Без оффтопа'],
    telegramLink: 'https://t.me/PolarisSnow',
    estimatedMembers: 5700
  },
  {
    slug: 'stelscaptain',
    username: 'stelscaptain',
    title: 'Снегоходы Stels Капитан & Ермак Club',
    brand: 'Stels',
    category: 'Снегоходы',
    image: 'assets/img/d6cb2573-0941-4c12-9c3f-4eeb43ce6cb5-5431501.jpeg',
    shortDesc: 'Компактные и утилитарные снегоходы Stels: Капитан (S150, S200), Ермак, Мороз, Витязь, Ставр.',
    fullDesc: 'Народный клуб владельцев доступных российских снегоходов Stels завода «Веломоторс». Доработка компактного «Капитана» для охоты, рыбалки и покатушек с семьей, регулировка карбюраторов и вариатора, подогрев ручек и продление ресурса.',
    modelsCovered: ['Stels Капитан S150 / S200 / S200L (Long гусеница)', 'Stels Витязь 800', 'Stels Ставр 600', 'Stels Ермак 600 / 800 (две гусеницы, одна лыжа)', 'Stels Мороз 600'],
    keyTopics: ['Доработка склизов и натяжка гусеницы', 'Замена цепи редуктора и подшипников на японские', 'Установка дополнительного света и кофров для рыбалки', 'Настройка карбюратора для легкого пуска в -30°C'],
    rules: ['Взаимовыручка и полезные доработки своими руками', 'Без мата', 'Помощь новичкам'],
    telegramLink: 'https://t.me/stelscaptain',
    estimatedMembers: 4800
  }
];

// Helper to find chat by slug or username or title
export function findChatInCatalog(identifier: string): ChatCatalogItem | undefined {
  if (!identifier) return undefined;
  const clean = identifier.toLowerCase().replace('@', '').replace(/\/$/, '');
  return CHATS_CATALOG.find(c => 
    c.slug.toLowerCase() === clean || 
    c.username.toLowerCase() === clean ||
    c.telegramLink.toLowerCase().endsWith('/' + clean) ||
    c.title.toLowerCase().includes(clean)
  );
}

// Memory & Database Cache for 30-Day Daily Summaries
export const chatSummariesStore: Map<string, ChatDailySummary[]> = new Map();

// Helper to parse HTML-formatted Telegram digests into structured topics
export function parseDigestSummaryToTopics(rawHtml: string): { dayLabel: string; topics: { emoji: string; title: string; description: string }[] } {
  const topics: { emoji: string; title: string; description: string }[] = [];
  if (!rawHtml) return { dayLabel: '', topics: [] };

  // Extract date if present
  let dayLabel = '';
  const dateMatch = rawHtml.match(/📅\s*<i>(.*?)<\/i>/i) || rawHtml.match(/📅\s*(.*?)(\n|$)/i);
  if (dateMatch) {
    dayLabel = dateMatch[1].trim();
  }

  // Regex matching standard telegram digest format: 🔥 <b>Topic Title</b>\n<blockquote...>Description</blockquote>
  const headerRegex = /([🔥💡📣🔧⚙️⚡🛡️🗺️🔍👥📊])\s*<b>(.*?)<\/b>\s*[\n\r]*<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  let match;
  while ((match = headerRegex.exec(rawHtml)) !== null) {
    const emoji = match[1];
    const title = match[2].trim();
    const desc = match[3].trim().replace(/<\/?b>/gi, '').replace(/<\/?i>/gi, '').replace(/<a\s+[^>]*>(.*?)<\/a>/gi, '$1');
    topics.push({ emoji, title, description: desc });
  }

  // Fallback if no blockquote was used
  if (topics.length === 0) {
    const boldRegex = /([🔥💡📣🔧⚙️⚡🛡️🗺️🔍👥📊])\s*<b>(.*?)<\/b>([\s\S]*?)(?=(?:[🔥💡📣🔧⚙️⚡🛡️🗺️🔍👥📊]\s*<b>|$))/gi;
    while ((match = boldRegex.exec(rawHtml)) !== null) {
      const emoji = match[1];
      const title = match[2].trim();
      const desc = match[3].trim().replace(/<\/?blockquote[^>]*>/gi, '').replace(/<\/?b>/gi, '').replace(/<\/?i>/gi, '').replace(/<a\s+[^>]*>(.*?)<\/a>/gi, '$1');
      topics.push({ emoji, title, description: desc });
    }
  }

  return { dayLabel, topics };
}

// Convert Firestore chat_digests document into ChatDailySummary
export function convertDbDigestToSummary(docData: any, chatSlug: string): ChatDailySummary {
  const rawHtml = docData.summary || '';
  const parsed = parseDigestSummaryToTopics(rawHtml);
  const createdDate = docData.createdAt ? new Date(docData.createdAt) : new Date();
  const dateStr = createdDate.toISOString().split('T')[0];
  const dayLabel = parsed.dayLabel || new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(createdDate);

  const topics = parsed.topics.length > 0 ? parsed.topics : [
    { emoji: '🔥', title: 'Главные темы и обсуждения', description: rawHtml.replace(/<[^>]*>/g, '').substring(0, 300) + '...' },
    { emoji: '💡', title: 'Технические советы и опыт', description: 'Участники чата обменялись практическими рекомендациями по обслуживанию и эксплуатации.' }
  ];

  return {
    id: `sum_${chatSlug}_${docData.id || dateStr}`,
    chatSlug: chatSlug,
    date: dateStr,
    dayLabel: dayLabel,
    title: `Дайджест за ${dayLabel}`,
    messageCount: docData.messageCount || 50,
    activeUsersCount: docData.userCount || 15,
    topics: topics,
    rawSummaryHtml: rawHtml,
    createdAt: docData.createdAt || new Date().toISOString(),
    isReal: true
  };
}

// Helper to generate seed summaries if chat has no DB digests yet
export function generateSeedSummariesForChat(chat: ChatCatalogItem): ChatDailySummary[] {
  const summaries: ChatDailySummary[] = [];
  const now = new Date();

  const topicTemplates = [
    {
      emoji: '🔧',
      title: 'Техобслуживание, замена расходников и подготовка',
      desc: `Участники детально обсудили подбор моторного масла по вязкости и допускам для ${chat.modelsCovered[0] || 'двигателя'}, интервалы замены тормозной жидкости и прокачку контуров. Также был разобран вопрос ресурса свечей зажигания и своевременной чистки воздушного фильтра перед активным сезоном.`
    },
    {
      emoji: '🏍️',
      title: 'Выбор резины, давление в шинах и держак на асфальте/грунте',
      desc: `В чате развернулась оживленная дискуссия о выборе покрышек для города и дальних поездок. Сравнивались модели Michelin, Pirelli, Metzeler и Mitas. Пришли к общему выводу о необходимости строго контролировать давление на холодную для предотвращения неравномерного износа протектора.`
    },
    {
      emoji: '⚡',
      title: 'Электрика, реле-регулятор и зарядка аккумулятора',
      desc: `Были рассмотрены частые симптомы просадки напряжения на холостых оборотах и проверка генератора мультиметром. Опытные участники порекомендовали проверенные схемы подключения дополнительного оборудования (USB-зарядки, навигаторы, доп. свет) строго через предохранитель и реле от замка зажигания.`
    },
    {
      emoji: '🛡️',
      title: 'Защитные дуги, клетки и экипировка для безопасности',
      desc: `Обсуждались краш-тесты дуг от отечественных и зарубежных производителей. Участники сошлись во мнении, что наличие правильных слайдеров и надежных дуг многократно снижает риск повреждения крышек картера и радиатора даже при легких падениях на околонулевой скорости.`
    },
    {
      emoji: '🗺️',
      title: 'Маршруты путешествий, бронирование стоянок и прохваты',
      desc: `Был составлен список живописных маршрутов выходного дня с хорошим асфальтом и минимумом камер. Участники поделились точками проверенных заправок с качественным бензином и уютными кемпингами для ночевок с палатками.`
    },
    {
      emoji: '🔍',
      title: 'Выбор техники со вторичного рынка и проверка состояния',
      desc: `Новичкам дали подробную инструкцию по первичному осмотру ${chat.modelsCovered[0] || 'мотоцикла'}: проверка люфтов в рулевой колонке и маятнике, замер компрессии, оценка состояния цепи со звездами и проверка подлинности номеров рамы по базам.`
    },
    {
      emoji: '⚙️',
      title: 'Трансмиссия, сцепление и тонкости переключения передач',
      desc: `Рассмотрели регулировку свободного хода троса сцепления, симптомы пробуксовки фрикционов под нагрузкой на высших передачах и правильный подбор пружин сцепления. Подчеркнули важность использования масел с правильным допуском JASO MA2 для мокрого сцепления.`
    },
    {
      emoji: '💡',
      title: 'Установка дополнительного света, ветрозащита и акустика',
      desc: `Участники поделились фото и схемами монтажа линзованных светодиодных противотуманок с четкой светотеневой границей, чтобы не слепить встречный поток. Также обсудили регулируемые дефлекторы на ветровые стекла для снятия нагрузки с шеи на трассе.`
    }
  ];

  // Generate 30 days (from today down to 29 days ago)
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    
    const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const dayLabel = dayFormatter.format(d);

    const msgCount = Math.floor(45 + Math.sin(i * 1.5 + chat.slug.length) * 30 + (i % 5) * 12);
    const userCount = Math.max(8, Math.floor(msgCount * 0.35));

    const tIndex1 = (i * 2) % topicTemplates.length;
    const tIndex2 = (i * 2 + 1) % topicTemplates.length;
    const tIndex3 = (i * 2 + 3) % topicTemplates.length;

    const chosenTopics = [
      topicTemplates[tIndex1],
      topicTemplates[tIndex2],
      topicTemplates[tIndex3]
    ];

    let html = `📊 <b>Суточный дайджест: ${chat.title}</b>\n📅 <i>${dayLabel}</i>\n\n`;
    chosenTopics.forEach(t => {
      html += `${t.emoji} <b>${t.title}</b>\n<blockquote expandable>${t.desc}</blockquote>\n\n`;
    });
    html += `👥 <b>Атмосфера дня</b>\n<blockquote expandable>В чате царила дружелюбная рабочая атмосфера, опытные райдеры оперативно ответили на технические вопросы новичков, обсудили планы на ближайшие выходные и договорились о совместном выезде.</blockquote>`;

    summaries.push({
      id: `sum_${chat.slug}_${dateStr}`,
      chatSlug: chat.slug,
      date: dateStr,
      dayLabel: dayLabel,
      title: `Дайджест за ${dayLabel}`,
      messageCount: msgCount,
      activeUsersCount: userCount,
      topics: chosenTopics.map(t => ({ emoji: t.emoji, title: t.title, description: t.desc })),
      rawSummaryHtml: html,
      createdAt: d.toISOString(),
      isReal: false
    });
  }

  return summaries;
}

// Function to add a summary for a chat and prune older than 30
export function addChatSummary(chatSlug: string, summary: ChatDailySummary): ChatDailySummary[] {
  let list = chatSummariesStore.get(chatSlug) || [];
  
  // Remove existing summary for this date if exists
  list = list.filter(s => s.date !== summary.date && s.id !== summary.id);

  // Insert at top (newest first)
  list.unshift(summary);

  // Keep strictly maximum 30 summaries
  if (list.length > 30) {
    list = list.slice(0, 30);
  }

  chatSummariesStore.set(chatSlug, list);
  return list;
}

// Async loader to populate chatSummariesStore from real Firestore chat_digests
export async function loadRealDigestsFromDatabase(): Promise<void> {
  try {
    const digestsSnap = await db.collection('chat_digests').get();
    if (digestsSnap.empty) {
      console.log('[ChatCatalog] В коллекции chat_digests пока нет записей.');
      return;
    }

    const allDigests = digestsSnap.docs.map(d => d.data());

    for (const chat of CHATS_CATALOG) {
      const mapping = CHAT_TO_DB_MAPPING[chat.slug];
      
      // Filter digests belonging to this chat
      const realForChat = allDigests.filter(d => {
        if (!d) return false;
        if (mapping && mapping.id && String(d.chatId) === mapping.id) return true;
        if (d.chatTitle) {
          const dTitle = d.chatTitle.toLowerCase();
          if (mapping?.altTitles?.some(t => dTitle.includes(t))) return true;
          if (dTitle.includes(chat.title.toLowerCase()) || chat.title.toLowerCase().includes(dTitle)) return true;
        }
        return false;
      });

      if (realForChat.length > 0) {
        // Sort newest first
        realForChat.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        
        // Convert to ChatDailySummary
        const realSummaries = realForChat.map(d => convertDbDigestToSummary(d, chat.slug));
        
        // If real summaries < 30, we can prepend real ones and fill remaining older dates from seed
        const realDates = new Set(realSummaries.map(s => s.date));
        const seedSummaries = generateSeedSummariesForChat(chat).filter(s => !realDates.has(s.date));
        
        const combined = [...realSummaries, ...seedSummaries];
        combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        chatSummariesStore.set(chat.slug, combined.slice(0, 30));
      } else {
        // No real digests yet for this chat, use generated seed
        const seed = generateSeedSummariesForChat(chat);
        chatSummariesStore.set(chat.slug, seed);
      }
    }

    console.log(`[ChatCatalog] ✅ Успешно загружены и привязаны реальные дайджесты из базы для ${CHATS_CATALOG.length} чатов.`);
  } catch (err) {
    console.error('[ChatCatalog] Ошибка загрузки дайджестов из базы:', err);
  }
}

// Get the 30 daily summaries for a chat (ensuring exactly up to 30 items)
export function getChatSummaries(chatSlug: string): ChatDailySummary[] {
  let list = chatSummariesStore.get(chatSlug);
  if (!list || list.length === 0) {
    const catalogItem = findChatInCatalog(chatSlug);
    if (catalogItem) {
      list = generateSeedSummariesForChat(catalogItem);
      chatSummariesStore.set(chatSlug, list);
    } else {
      return [];
    }
  }

  // Sort newest first & enforce max 30
  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (list.length > 30) {
    list = list.slice(0, 30);
    chatSummariesStore.set(chatSlug, list);
  }
  return list;
}
