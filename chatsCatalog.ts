// Motorcycle & Snowmobile Chat Catalog Definition with Descriptions & 30-Day Summaries Engine

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
}

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
    fullDesc: 'Центральный всероссийский моточат, объединяющий владельцев всех классов мотоциклов — от спортбайков и чопперов до хард-эндуро и турэндуро. Здесь обсуждаются мотопутешествия по всей России, законодательные инициативы, выбор первой техники, межсезонье и организация всероссийских мотофестивалей.',
    modelsCovered: ['Все классы и бренды мотоциклов', 'Скутеры и трициклы', 'Кастомы и ретро'],
    keyTopics: ['Мотопутешествия и дальняки по РФ', 'Выбор первого мотоцикла и экипа', 'ПДД и юридические вопросы для мотоциклистов', 'Взаимовыручка на дорогах'],
    rules: ['Взаимное уважение к пилотам любых классов техники', 'Запрещена политика и коммерческий спам', 'Позитивная атмосфера и взаимопомощь'],
    telegramLink: 'https://t.me/BikersRus',
    estimatedMembers: 22800
  },
  {
    slug: 'motokostroma',
    username: 'MotoKostroma',
    title: 'Моточат Кострома',
    brand: 'Кострома',
    category: 'Регионы',
    image: 'assets/img/bedd0f9a-2766-4ff8-b0d4-ecafa738aefe-10671316.png',
    shortDesc: 'Общение, совместные выезды и взаимопомощь мотоциклистов Костромы.',
    fullDesc: 'Региональное сообщество мотоциклистов Костромской области. Организация вечерних прохватов по городу, поездок по живописным местам Поволжья, координация помощи при поломках и обсуждение местных мотосервисов.',
    modelsCovered: ['Городские дорожники', 'Круизеры и чопперы', 'Эндуро и кросс'],
    keyTopics: ['Сборы на вечерние прохваты в Костроме', 'Состояние дорог области', 'Локальные сервисы и шиномонтажи', 'Покатушки выходного дня'],
    rules: ['Уважение к участникам', 'Запрещена несанкционированная реклама', 'Соблюдение ПДД при групповых выездах'],
    telegramLink: 'https://t.me/MotoKostroma',
    estimatedMembers: 1850
  },
  {
    slug: 'motoivanovo',
    username: 'MotoIvanovo',
    title: 'Моточат Иваново',
    brand: 'Иваново',
    category: 'Регионы',
    image: 'assets/img/582e8902-82ce-410d-9c10-0b8706b0ff45-10671313.png',
    shortDesc: 'Чат мотоциклистов Ивановской области: встречи, маршруты и помощь.',
    fullDesc: 'Активный чат байкеров Иваново, Шуи, Кинешмы и всей области. Обсуждение мотокультуры, открытие и закрытие сезона, совместные поездки на треки и в соседние города Золотого кольца.',
    modelsCovered: ['Стриты', 'Спортбайки', 'Турэндуро', 'Питбайки'],
    keyTopics: ['Локальные мото-события и фестивали', 'Поиск попутчиков на дальние выезды', 'Обмен запчастями и экипировкой', 'Места для эндуро-тренировок'],
    rules: ['Доброжелательное общение', 'Без оффтопа и спама', 'Помощь новичкам'],
    telegramLink: 'https://t.me/MotoIvanovo',
    estimatedMembers: 2100
  },
  {
    slug: 'motonnchat',
    username: 'MotoNNchat',
    title: 'Моточат Нижний Новгород',
    brand: 'Нижний Новгород',
    category: 'Регионы',
    image: 'assets/img/9b950146-49bf-45f3-b137-8abfa7f2c420-10671314.png',
    shortDesc: 'Крупнейшее сообщество байкеров Нижегородской области.',
    fullDesc: 'Главная точка сбора мотоциклистов Нижнего Новгорода. Сборы на Нижне-Волжской набережной и Стрелке, выезды на трек NRing (Нижегородское кольцо), обсуждение дорожной обстановки и оперативная помощь на дорогах.',
    modelsCovered: ['Все типы мотоциклов', 'Трековые болиды', 'Туреры'],
    keyTopics: ['Трек-дни на Нижегородском кольце (NRing)', 'Сборы на набережной и прохваты', 'Дорожная обстановка и камеры', 'Сервисы и мотоэвакуатор в НН'],
    rules: ['Без мата и оскорблений', 'Реклама только с разрешения админов', 'Культура на дорогах'],
    telegramLink: 'https://t.me/MotoNNchat',
    estimatedMembers: 4200
  },
  {
    slug: 'motoyar',
    username: 'MotoYar',
    title: 'Моточат Ярославль',
    brand: 'Ярославль',
    category: 'Регионы',
    image: 'assets/img/37b61f41-5105-406f-aa01-aad2a1493506-6415904.jpeg',
    shortDesc: 'Мото-сообщество Ярославля, Рыбинска и области.',
    fullDesc: 'Чат ярославских мотоциклистов: прохваты по набережным Волги и Которосли, выезды на Рыбинское водохранилище, обмен опытом по обслуживанию техники и поддержка мотодвижения региона.',
    modelsCovered: ['Классики', 'Круизеры', 'Спорт-туристы', 'Эндуро'],
    keyTopics: ['Поездки на Рыбинку и по области', 'Обслуживание и зимнее хранение мотоциклов', 'Сходки на Стрелке', 'Помощь на трассе М8'],
    rules: ['Взаимовыручка', 'Чистота чата от спама', 'Позитив'],
    telegramLink: 'https://t.me/MotoYar',
    estimatedMembers: 3100
  },

  // --- BMW ---
  {
    slug: 'bmwgsclub',
    username: 'bmwgsclub',
    title: 'BMW GS Club Russia',
    brand: 'BMW',
    category: 'Брендовые',
    image: 'assets/img/7851f8e1-29ce-41e6-bdb5-78501f93b624-5431058.jpeg',
    shortDesc: 'Легендарные турэндуро BMW: R1200GS, R1250GS, F850GS, F800GS и др.',
    fullDesc: 'Крупнейшее сообщество владельцев легендарной серии «Гусей» BMW GS. Технические тонкости оппозитных и рядных моторов, карданный привод, подвеска Telelever/Paralever, выбор резины для асфальта и бездорожья, подготовка к кругосветным экспедициям и путешествиям на Памир, Алтай и Кольский.',
    modelsCovered: ['R 1250 GS / Adventure', 'R 1200 GS (LC / воздушники)', 'R 1150 GS / R 1100 GS', 'F 850 GS / F 800 GS', 'F 750 GS / F 700 GS', 'G 310 GS'],
    keyTopics: ['Обслуживание кардана и редуктора', 'Выбор дуг, кофров и ветрозащиты', 'Резина 50/50 и 80/20 для дальняков', 'Диагностика через GS-911 и MotoScan', 'Маршруты для тяжелых турэндуро'],
    rules: ['Обсуждение техники по существу', 'Делимся проверенными артикулами запчастей', 'Уважение к владельцам любых объемов GS'],
    telegramLink: 'https://t.me/bmwgsclub',
    estimatedMembers: 9800
  },
  {
    slug: 'bmwtourclub',
    username: 'BMWtourclub',
    title: 'BMW Tour Club (RT / LT / GT / GTL / ST)',
    brand: 'BMW',
    category: 'Брендовые',
    image: 'assets/img/c7fcd2c0-d324-4565-8003-bbfbed873df3-5636102.jpeg',
    shortDesc: 'Люксовые туреры BMW: R1200RT, R1250RT, K1600GT/GTL, K1200LT.',
    fullDesc: 'Чат любителей комфортабельных путешествий первого класса на мотоциклах BMW серий RT, LT, GT и 6-цилиндровых K1600. Обсуждение аудиосистем, ветрозащиты, пневмоподвески ESA, круиз-контроля, сервиса оппозитов и рядных шестерок.',
    modelsCovered: ['K 1600 GT / GTL / Bagger', 'R 1250 RT / R 1200 RT', 'K 1200 LT / K 1300 GT', 'F 800 GT / F 800 ST'],
    keyTopics: ['Комфорт в дальних поездках', 'Электроника и блоки управления', 'Установка акустики и интеркомов', 'Замена сцепления и жидкостей', 'Кожаная экипировка и туринговые шлемы'],
    rules: ['Конструктивные дискуссии', 'Без флуда в профильных темах', 'Уважение к одноклубникам'],
    telegramLink: 'https://t.me/BMWtourclub',
    estimatedMembers: 4700
  },

  // --- BSE & CFMOTO ---
  {
    slug: 'bserus',
    username: 'BSErus',
    title: 'BSE Клуб Россия',
    brand: 'BSE',
    category: 'Брендовые',
    image: 'assets/img/22d8f5c1-efda-473e-95cd-1b693460e6d3-5431479.jpeg',
    shortDesc: 'Питбайки, кросс и эндуро мотоциклы BSE Racing.',
    fullDesc: 'Клуб владельцев китайских мотоциклов и питбайков BSE (Bosuer). Настройка подвесок Fastace/MNT, регулировка карбюраторов Nibbi, подбор звезд и цепей, доработка прогрессии, выбор масел и преодоление хард-эндуро препятствий.',
    modelsCovered: ['BSE Z1 / Z2 / Z3 / Z5 / Z7 / Z11', 'BSE M2 / M4 / M8', 'BSE RTC 300 / MX 250', 'Питбайки BSE PH10 / EX125 / EVO'],
    keyTopics: ['Регулировка клапанов на моторах Zongshen 172FMM/174MN/177MM', 'Усиление рамы и защита картера', 'Смазка прогрессии и рулевой колонки', 'Эндуро-прохваты по лесам и карьерам'],
    rules: ['Делимся опытом ремонта своими руками', 'Без токсичности', 'Помощь новичкам в выборе питбайка'],
    telegramLink: 'https://t.me/BSErus',
    estimatedMembers: 5600
  },
  {
    slug: 'cfmotorus',
    username: 'CFMOTOrus',
    title: 'CFMOTO Клуб Россия',
    brand: 'CFMOTO',
    category: 'Брендовые',
    image: 'assets/img/de102a7d-386f-47a0-b324-62bbc51ee49a-5636103.jpeg',
    shortDesc: 'Мотоциклы и квадроциклы CFMOTO: 800MT, 700CL-X, 650MT, 450SR.',
    fullDesc: 'Официальное комьюнити владельцев современной мототехники CFMOTO. Новейшие турэндуро 800MT и 450MT с моторами KTM, нео-ретро 700CL-X, спортбайки 450SR и квадроциклы CFORCE. Гарантийное обслуживание, прошивки блоков, тюнинг и путешествия.',
    modelsCovered: ['CFMOTO 800MT / 450MT Touring', 'CFMOTO 700CL-X (Heritage / Sport / Adventure)', 'CFMOTO 450SR / 300SR', 'CFMOTO 650MT / 650GT', 'Квадроциклы CFORCE 600 / 800 / 1000'],
    keyTopics: ['Обслуживание двигателей и электроники Bosch', 'Расходники и взаимозаменяемость с европейцами', 'Опыт дальних поездок на 800MT', 'Отзывы о дилерах и ТО'],
    rules: ['Конструктивный диалог', 'Запрещены провокации', 'Делимся реальным опытом эксплуатации'],
    telegramLink: 'https://t.me/CFMOTOrus',
    estimatedMembers: 7200
  },

  // --- Honda ---
  {
    slug: 'hondacbrus',
    username: 'HondaCBrus',
    title: 'Honda CB Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/f1f3e132-c4b4-4e5e-aba1-4c9e85c633f1-12066188.jpeg',
    shortDesc: 'Классические дорожники Honda: CB400 Super Four, CB600 Hornet, CB1000R, CB1300.',
    fullDesc: 'Всероссийский клуб легендарных классиков и нейкедов Honda CB. Неубиваемые моторы, синхронизация карбюраторов на CB400/CB1300, тюнинг подвесок, ветровые стекла для трассы, подбор резины и надежность для города.',
    modelsCovered: ['CB 400 SF (NC31 / NC39 / NC42 Revo)', 'CB 600 F Hornet / CB 650 R', 'CB 1000 R Neo Sports Cafe', 'CB 1300 Super Four / Super Bol d’Or', 'CB 750 / CB 1100'],
    keyTopics: ['Чистка и синхронизация карбюраторов', 'Замена цепи ГРМ и натяжителя', 'Выбор дуг Crazy Iron и защитных клеток', 'Свечи, фильтры и оригинальные расходники'],
    rules: ['Уважение к классике Honda', 'Советы по ремонту от опытных механиков', 'Без спама'],
    telegramLink: 'https://t.me/HondaCBrus',
    estimatedMembers: 11400
  },
  {
    slug: 'hondacbrrus',
    username: 'HondaCBRrus',
    title: 'Honda CBR Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/9fd111e4-d6ca-4aa6-8a9c-32c8c64081e0-5431469.jpeg',
    shortDesc: 'Спортбайки Honda: CBR600RR, CBR1000RR Fireblade, CBR1100XX Дрозд, CBR600F4i.',
    fullDesc: 'Чат пилотов спортивной линейки CBR. От легендарного спорт-туриста «Дрозд» CBR1100XX и практичного CBR600F4i до бескомпромиссных трековых Fireblade CBR1000RR-R. Тренировки на картодромах, настройка квикшифтеров, правильная спортивная посадка и безопасность на высоких скоростях.',
    modelsCovered: ['CBR 1000 RR Fireblade', 'CBR 600 RR', 'CBR 1100 XX Super Blackbird («Дрозд»)', 'CBR 600 F4 / F4i', 'CBR 650 R / F', 'CBR 250 / 300 / 500 R'],
    keyTopics: ['Трековые тренировки и экипировка (комбинезоны, мотоботы)', 'Тормозные колодки и армированные шланги', 'Регулировка подвески под вес пилота', 'Замена звезд и цепей 520/525/530'],
    rules: ['Призыв к соблюдению безопасности и экипу', 'Без взаимных оскорблений', 'Качественный технический контент'],
    telegramLink: 'https://t.me/HondaCBRrus',
    estimatedMembers: 8900
  },
  {
    slug: 'hondaglrus',
    username: 'HondaGLrus',
    title: 'Honda Gold Wing Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/e3ba830a-0412-4213-9f07-794a671e07d4-10670839.jpeg',
    shortDesc: 'Круизные лайнеры Honda Gold Wing GL1500, GL1800, F6B, Valkyrie.',
    fullDesc: 'Элитное сообщество владельцев флагманских люкс-туреров Honda Gold Wing. Оппозитные 6-цилиндровые двигатели, подушки безопасности, роботизированные коробки DCT, тюнинг света, пневма и тысячи километров комфорта без усталости.',
    modelsCovered: ['GL 1800 Gold Wing (2001–2017 и 2018+ DCT)', 'GL 1500 Gold Wing', 'Gold Wing F6B Bagger', 'Valkyrie Rune / F6C'],
    keyTopics: ['Установка дополнительного света и музыки', 'Обслуживание подвески и антиклевка', 'Особенности коробки DCT на новых поколениях', 'Организация всероссийских Голдвинг-слетов'],
    rules: ['Братская атмосфера взаимопомощи', 'Культура общения', 'Обмен туринговым опытом'],
    telegramLink: 'https://t.me/HondaGLrus',
    estimatedMembers: 6300
  },
  {
    slug: 'steedrus',
    username: 'SteedRus',
    title: 'Honda Steed Клуб Россия',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/3caa0603-5a77-406c-8684-f4814fcba418-5431476.jpeg',
    shortDesc: 'Культовые японские чопперы Honda Steed 400 / 600 (VLX, VSE, VLS).',
    fullDesc: 'Олдскульное сообщество фанатов Honda Steed (NV400 / NV600). Неприхотливые V-твины, боббер- и чоппер-кастомизация, переделка выхлопа, спрингер-вилки, регулировка карбюраторов и душевная атмосфера железных коней.',
    modelsCovered: ['Honda Steed 400 (VLX / VCL / VSE / VLS)', 'Honda Steed 600'],
    keyTopics: ['Боббер-строение и кастом своими руками', 'Мембраны карбюраторов и прямоточный выхлоп', 'Обслуживание спицованных колес', 'Поиск редких японских запчастей'],
    rules: ['Уважение к кастом-культуре', 'Делимся чертежами и советами', 'Без флуда'],
    telegramLink: 'https://t.me/SteedRus',
    estimatedMembers: 4100
  },
  {
    slug: 'hondarebel',
    username: 'hondarebelcmx1100',
    title: 'Honda Rebel Club (CMX 300 / 500 / 1100)',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/7866340f-402c-4d36-ba83-6a4e932c1976-11786754.jpeg',
    shortDesc: 'Современные бобберы Honda Rebel CMX300, CMX500 и литровый CMX1100 DCT.',
    fullDesc: 'Клуб современных городских бобберов Honda Rebel. Низкая посадка по седлу, маневренность, двигатели от Африки Твин на CMX1100, режимы езды, кофры, сиденья и тюнинг для идеального стиля в городе.',
    modelsCovered: ['CMX 1100 Rebel (Manual & DCT)', 'CMX 500 Rebel', 'CMX 300 Rebel', 'Rebel 1100T Touring'],
    keyTopics: ['Выбор удобного кастомного сиденья', 'Установка дуг и багажных систем', 'Работа коробки DCT на Rebel 1100', 'Выхлопные системы Vance & Hines / Akrapovic'],
    rules: ['Дружелюбное общение', 'Помощь новичкам и девушкам-райдерам', 'Без спама'],
    telegramLink: 'https://t.me/hondarebelcmx1100',
    estimatedMembers: 2900
  },
  {
    slug: 'varaderorus',
    username: 'VaraderoRus',
    title: 'Honda Varadero & Transalp Club',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/e206b19c-7798-4df7-9256-8c573e9fd7d5-5431478.jpeg',
    shortDesc: 'Турэндуро Honda XL1000V Varadero, Transalp XL600/650/700/750.',
    fullDesc: 'Сообщество путешественников на надежнейших турэндуро Honda Varadero 1000 с могучим V-twin и линейке Transalp. Комбинированные тормоза CBS, настройка подвески, преодоление серпантинов и грунтовок.',
    modelsCovered: ['XL1000V Varadero (Карб / Инжектор)', 'Transalp XL600V / XL650V / XL700V', 'Новый Transalp XL750'],
    keyTopics: ['Бензонасос и реле-регулятор', 'Высокое стекло и ветрозащита', 'Усиленные пружины прогрессии', 'Маршруты по Кавказу и Карелии'],
    rules: ['Делимся координатами стоянок и треками', 'Техническая взаимопомощь', 'Позитив'],
    telegramLink: 'https://t.me/VaraderoRus',
    estimatedMembers: 3800
  },
  {
    slug: 'hondavfrclub',
    username: 'HondaVFRclub',
    title: 'Honda VFR Клуб (V4 Interceptor)',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/ad5975ad-6759-4c4c-aa33-c7443e4398fb-12066017.jpeg',
    shortDesc: 'Технологичные спорт-туристы с мотором V4: VFR800 VTEC, VFR1200, VFR400/750.',
    fullDesc: 'Чат преданных ценителей уникальной архитектуры двигателей V4 от Honda. Шестеренчатый привод ГРМ на старых поколениях, подключение клапанов VTEC на VFR800, консольный маятник, кардан и мощь 1200-кубового флагмана.',
    modelsCovered: ['VFR 800 Fi / VTEC / Crossrunner', 'VFR 1200 F / Crosstourer (DCT)', 'VFR 750 F (RC36)', 'VFR 400 R (NC30) / RVF 400 (NC35)'],
    keyTopics: ['Регулировка клапанов на системе VTEC', 'Реле-регулятор и генератор', 'Консольный маятник и подшипники ступицы', 'Идеальный баланс спорта и туризма'],
    rules: ['Грамотные технические советы', 'Без оффтопа в профильных ветках', 'Уважение'],
    telegramLink: 'https://t.me/HondaVFRclub',
    estimatedMembers: 5200
  },
  {
    slug: 'hondavtx',
    username: 'Honda_VTX',
    title: 'Honda VTX & VT Shadow Club',
    brand: 'Honda',
    category: 'Брендовые',
    image: 'assets/img/045786dd-ba1e-42d9-952d-e6fb6dc6e4b1-9236262.jpeg',
    shortDesc: 'Монументальные круизеры Honda VTX1800, VTX1300 и линейка VT750/1100 Shadow.',
    fullDesc: 'Крупнейшее сообщество владельцев тяжелых пауэр-круизеров Honda VTX с колоссальным крутящим моментом и нестареющей классики Shadow. Тюнинг звука выхлопа, хром, кофры, выносы подножек и дальние круизы по хайвеям.',
    modelsCovered: ['VTX 1800 (C / R / S / N / F)', 'VTX 1300 (C / R / S / T)', 'VT 750 Shadow (Phantom / Spirit / Aero)', 'VT 1100 Shadow / Sabre'],
    keyTopics: ['Расход топлива и настройка топливных карт (Power Commander)', 'Устранение «воблинга» и подшипники рулевой колонки All Balls', 'Сцепление Barnett и усиленные пружины', 'Полировка хрома и уход за кожей'],
    rules: ['Уважение к традициям чопперостроения', 'Делимся проверенными мастерами', 'Без спама'],
    telegramLink: 'https://t.me/Honda_VTX',
    estimatedMembers: 7600
  },

  // --- Kawasaki ---
  {
    slug: 'er6club',
    username: 'er6club',
    title: 'Kawasaki ER-6 & Ninja 650 Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/e3058abe-a224-4134-b5b9-743731af2acc-5431480.jpeg',
    shortDesc: 'Популярные городские универсалы Kawasaki ER-6n, ER-6f, Ninja 650, Versys 650, Z650.',
    fullDesc: 'Клуб владельцев динамичных 2-цилиндровых рядников Kawasaki 650cc. Идеальный мотоцикл для города и поездок выходного дня. Особенности клапанного механизма, подбор подвески, слайдеров и ветровых стекол.',
    modelsCovered: ['ER-6n (Naked) 2006–2016', 'ER-6f / Ninja 650 (Fairing)', 'Versys 650 (Турэндуро)', 'Z 650 (2017+)'],
    keyTopics: ['Регулировка зазоров клапанов и замена шайб', 'Слайдеры и дуги для защиты двигателя при падениях', 'Выбор передних тормозных дисков и колодок', 'Опыт новичков в первый сезон'],
    rules: ['Поддержка начинающих водителей', 'Без грубости', 'Техническая грамотность'],
    telegramLink: 'https://t.me/er6club',
    estimatedMembers: 8400
  },
  {
    slug: 'kleclub',
    username: 'KLEclub',
    title: 'Kawasaki KL / KLE / KLR / KLX Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/d188835d-4446-41c9-87be-2c7f2955d67a-5431481.jpeg',
    shortDesc: 'Эндуро и турэндуро Kawasaki KLE250/500, KLR650, KLX250/300/450.',
    fullDesc: 'Сообщество любителей настоящих внедорожных приключений на мотоциклах Kawasaki. От юрких лесных эндуриков KLX250 до неубиваемого всемирного путешественника KLR650 («Doohickey» мод, бак на 23 литра) и двухцилиндрового KLE500.',
    modelsCovered: ['KLR 650 (Tengai / Gen1 / Gen2 / Gen3)', 'KLE 500 / KLE 250 Anhelo', 'KLX 250 / KLX 300 / KLX 450R', 'Super Sherpa KL250'],
    keyTopics: ['Замена балансирного натяжителя (Doohickey) на KLR650', 'Зубастая резина Mitas / Michelin Tracker', 'Настройка карбюратора Keihin CVK40', 'Эндуро-маршруты и броды'],
    rules: ['Братство эндуристов', 'Делимся треками для навигаторов', 'Без мата'],
    telegramLink: 'https://t.me/KLEclub',
    estimatedMembers: 4500
  },
  {
    slug: 'zzrrus',
    username: 'zzrrus',
    title: 'Kawasaki ZZR & Ninja Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/6fa62c88-c3f7-4af8-90dd-13e80ec3187e-5431482.jpeg',
    shortDesc: 'Спорт-туристы Kawasaki ZZR400, ZZR600, ZZR1100, ZZR1200, ZZR1400 (ZX-14R).',
    fullDesc: 'Легендарные скоростные гипер-байки и спорт-туристы семейства ZZR. Знаменитая динамика, вторая передача на 400-ках, масляное голодание на старых 1100 и космическая тяга 1400-кубового монстра ZX-14R.',
    modelsCovered: ['ZZR 1400 / ZX-14R', 'ZZR 1200 / ZZR 1100 (ZX-11)', 'ZZR 400 (ZX400K / ZX400N)', 'ZZR 600 (ZX-6E)', 'Ninja ZX-10R / ZX-6R'],
    keyTopics: ['Лечение вылета второй передачи на ZZR400', 'Синхронизация карбюраторов и чистка игольчатых клапанов', 'Тормоза Nissin / Brembo и армированные магистрали', 'Поведение на скоростях 200+ км/ч'],
    rules: ['Уважение к мощности техники', 'Делимся мануалами и схемами', 'Без флуда'],
    telegramLink: 'https://t.me/zzrrus',
    estimatedMembers: 6800
  },
  {
    slug: 'ridersvulcan',
    username: 'RidersVulcan',
    title: 'Kawasaki Vulcan Riders Club',
    brand: 'Kawasaki',
    category: 'Брендовые',
    image: 'assets/img/42942c91-b8c5-4ea1-8247-3fb818cc5068-10670841.jpeg',
    shortDesc: 'Круизеры Kawasaki Vulcan VN400, VN800, VN900, VN1500, VN1600, VN1700, VN2000.',
    fullDesc: 'Всероссийский клуб фанатов чопперов и круизеров Kawasaki Vulcan. От компактных бобберов VN800 и популярных VN900 Custom/Classic до гигантского 2-литрового 2-цилиндрового монстра Vulcan 2000 с паровозной тягой.',
    modelsCovered: ['Vulcan VN 2000', 'Vulcan VN 1700 Voyager / Vaquero', 'Vulcan VN 1500 / 1600 Mean Streak / Classic', 'Vulcan VN 900 Classic / Custom', 'Vulcan VN 800 / VN 400', 'Vulcan S (650cc)'],
    keyTopics: ['Обслуживание ременного и карданного привода', 'Масляная шестерня (POG) на VN1500', 'Платформы для ног, спинки водителя и ветровики', 'Звук настоящего японского V-twin'],
    rules: ['Байкерская солидарность', 'Взаимопомощь по запчастям', 'Уважение'],
    telegramLink: 'https://t.me/RidersVulcan',
    estimatedMembers: 5900
  },

  // --- KTM & KAYO ---
  {
    slug: 'dukerus',
    username: 'DukeRus',
    title: 'KTM Duke & Adventure Club',
    brand: 'KTM',
    category: 'Брендовые',
    image: 'assets/img/4ec10f0f-eb53-4ca2-a8c6-53890f5cbbe0-5431483.jpeg',
    shortDesc: '«Ready to Race»: KTM Duke 125/200/390/690/790/890/1290 Super Duke и серия Adventure.',
    fullDesc: 'Чат фанатов оранжевого безумия KTM! Взрывной характер, топовые тормоза Brembo/ByBre, подвеска WP Apex/Xplor, квикшифтеры, электроника Supermoto ABS и тонкости обслуживания форсированных австрийских моторов LC4/LC8.',
    modelsCovered: ['Duke 390 / RC 390', 'Duke 790 / 890 R / 990', '1290 Super Duke R / GT («The Beast»)', '390 / 790 / 890 / 1290 Super Adventure', '690 Enduro R / SMC R'],
    keyTopics: ['Масла Motorex и контроль уровня масла', 'Прошивки блоков и устранение чеков двигателя', 'Защитные клетки для станта и слайдеры', 'Трек-дни и агрессивный городской трафик'],
    rules: ['Любовь к динамике и скорости', 'Помощь с артикулами KTM PowerParts', 'Без токсичности'],
    telegramLink: 'https://t.me/DukeRus',
    estimatedMembers: 7800
  },
  {
    slug: 'kayoclub',
    username: 'KAYOclub',
    title: 'KAYO Клуб Россия',
    brand: 'KAYO',
    category: 'Брендовые',
    image: 'assets/img/6786a5a2-c361-42ba-b2cb-23bca048fcb1-5431484.jpeg',
    shortDesc: 'Популярнейшие эндуро мотоциклы и питбайки KAYO T2, T4, K1, K4, K6, TT125, TD125.',
    fullDesc: 'Крупнейшее сообщество владельцев техники KAYO в России. Самый массовый выбор для входа в эндуро: доработка китайской проводки, настройка подвески KKE/Fastace, правильная обкатка двигателей 172FMM, защита рук и ручки-неломайки.',
    modelsCovered: ['KAYO T2 Enduro / Supermoto', 'KAYO T4 / K1 / K2 / K4 / K6-R', 'Питбайки KAYO Basic / Classic / TT 125 / 140 / 190', 'Квадроциклы KAYO Bull / AU'],
    keyTopics: ['Замена заводского масла в вилке и амортизаторе', 'Установка карбюраторов Nibbi Racing PWK', 'Протяжка спиц и замена ступичных подшипников', 'Совместные эндуро-покатушки выходного дня'],
    rules: ['Делимся реальными лайфхаками ремонта', 'Уважение к новичкам', 'Без спама'],
    telegramLink: 'https://t.me/KAYOclub',
    estimatedMembers: 9200
  },

  // --- Suzuki ---
  {
    slug: 'gsfclub',
    username: 'GSFclub',
    title: 'Suzuki Bandit GSF Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/7ffc330f-b44c-4731-be69-ba0b92dbb3a0-5431485.jpeg',
    shortDesc: 'Культовые стритфайтеры Suzuki Bandit GSF 250, 400, 600, 650, 750, 1200, 1250.',
    fullDesc: 'Легендарные «Бандиты» с воздушно-масляными моторами SACS и современными инжекторными водянками. Неубиваемый характер мотора от Джиксера, круглая фара, доработка тормозов Tokico, синхронизация карбов и тюнинг выхлопа.',
    modelsCovered: ['Bandit GSF 1200 / GSF 1250 (Большой Бандит)', 'Bandit GSF 600 / GSF 650', 'Bandit GSF 400 (красноголовый / сероголовый)', 'Bandit GSF 750 / GSF 250'],
    keyTopics: ['Синхронизация карбюраторов Mikuni/Keihin', 'Устранение провалов на низах и регулировка холостых', 'Замена прогрессии и сальников вилки', 'Бюджетный и надежный мотоцикл на каждый день'],
    rules: ['Уважение к легенде Bandit', 'Делимся проверенными схемами проводки', 'Без флуда'],
    telegramLink: 'https://t.me/GSFclub',
    estimatedMembers: 8100
  },
  {
    slug: 'djebelrus',
    username: 'DjebelRus',
    title: 'Suzuki Djebel & DR-Z Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/eb175783-a4c3-4d69-a115-37330545f782-5431486.jpeg',
    shortDesc: 'Легенды хард-туризма: Suzuki Djebel 200 / 250 XC, DR650SE, DR-Z400 (S/SM/E).',
    fullDesc: 'Чат ценителей культового дальнобойного эндуро Djebel с гигантской фарой-прожектором, баком на 17 литров и сухим картером, а также нестареющего хулигана DR-Z400. Путешествия в самые дикие уголки планеты, преодоление тайги и бродов.',
    modelsCovered: ['Suzuki Djebel 250 XC (GPS ver.)', 'Suzuki Djebel 200', 'Suzuki DR-Z 400 S / SM / E', 'Suzuki DR 650 SE', 'Suzuki DR 250 / DR 350'],
    keyTopics: ['Мембрана карбюратора TM28 / BST31', 'Регулировка клапанов винтами / шайбами', 'Звездные соотношения 14/44, 13/47 под бездорожье', 'Экспедиционный багаж и мягкие сумки'],
    rules: ['Культура внедорожных путешествий', 'Бережное отношение к раритетной технике', 'Помощь на маршрутах'],
    telegramLink: 'https://t.me/DjebelRus',
    estimatedMembers: 5400
  },
  {
    slug: 'gsxrclub',
    username: 'GSXRclub',
    title: 'Suzuki GSX-R & Hayabusa Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/299c8fc2-6cb1-4475-8e36-f00e97669d51-5431487.jpeg',
    shortDesc: 'Спортбайки Suzuki GSX-R 600, 750, 1000 («Джиксеры») и легендарная Hayabusa GSX1300R.',
    fullDesc: 'Сообщество пилотов самых адреналиновых мотоциклов планеты. Легендарные «Джиксеры» всех поколений (K1–L9) и король автобанов «Буса». Спортивная телеметрия, трековые тренировки, титановые выхлопы Yoshimura и гоночные настройки.',
    modelsCovered: ['GSX-R 1000 (K-серия, L-серия, R-edition)', 'GSX-R 750 / GSX-R 600', 'GSX 1300 R Hayabusa (Gen 1 / Gen 2 / Gen 3)', 'GSX-S 750 / GSX-S 1000'],
    keyTopics: ['Настройка подвески Showa BFF / BFRC под трек', 'Квикшифтер и автоблиппер', 'Тормозные суппорты Brembo Monoblock', 'Безопасность пилотирования на гоночных треках'],
    rules: ['Только в полной экипировке!', 'Без детского хвастовства скоростями', 'Профессиональный подход'],
    telegramLink: 'https://t.me/GSXRclub',
    estimatedMembers: 8700
  },
  {
    slug: 'boulevardrus',
    username: 'BoulevardRus',
    title: 'Suzuki Intruder & Boulevard Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/226d7f02-a42e-4b68-b7db-14fdc8aa1bf4-5431488.jpeg',
    shortDesc: 'Мускул-круизеры Suzuki Boulevard M109R (VZR1800), C109R, M50, C50, Intruder.',
    fullDesc: 'Клуб харизматичных круизеров Suzuki. Главная звезда — мускулистый пауэр-круизер M109R / VZR1800 с широченным 240-м задним баллоном, коваными поршнями размером с кружку и агрессивным обтекателем фары.',
    modelsCovered: ['Boulevard M109R / Intruder M1800R (VZR1800)', 'Boulevard C109R / Intruder C1800R', 'Boulevard M50 / C50 / C90', 'Intruder VS 400 / 800 / 1400', 'Volusia VL800'],
    keyTopics: ['Вторая передача и усиление копирного вала на M109R', 'Выбор заднего баллона (240 / 260 / 280)', 'Сцепление и трос сцепления', 'Звук выхлопа Cobra / Vance & Hines'],
    rules: ['Байкерское братство', 'Делимся проверенными запчастями', 'Взаимопомощь'],
    telegramLink: 'https://t.me/BoulevardRus',
    estimatedMembers: 6700
  },
  {
    slug: 'skywaveclub',
    username: 'SkywaveClub',
    title: 'Suzuki Skywave / Burgman Club',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/79d1a3c0-ae73-42e1-a083-d5d1445b4c10-5431489.jpeg',
    shortDesc: 'Люксовые максискутеры Suzuki Skywave / Burgman 250, 400, 650 Executive.',
    fullDesc: 'Комьюнити владельцев самых удобных максискутеров для города и дальнобоя. Электронный вариатор SECVT на Burgman 650 с ручным переключением передач и режимом Power, огромный багажник под два шлема, подогрев ручек и сидений.',
    modelsCovered: ['Skywave / Burgman 650 (Executive)', 'Skywave / Burgman 400 (CK41 / CK42 / CK43 / CK44 / CK45)', 'Skywave / Burgman 250 (CJ41–CJ46)'],
    keyTopics: ['Болты вариатора и шестерни SECVT на Burgman 650', 'Замена ремня и грузиков вариатора (Dr. Pulley)', 'Масло в редукторе и двигателе', 'Комфорт ежедневных городских поездок'],
    rules: ['Уважение к максискутерному движению', 'Детальные инструкции по ремонту', 'Позитив'],
    telegramLink: 'https://t.me/SkywaveClub',
    estimatedMembers: 4900
  },
  {
    slug: 'vstromrus',
    username: 'vstromrus',
    title: 'Suzuki V-Strom Club Russia',
    brand: 'Suzuki',
    category: 'Брендовые',
    image: 'assets/img/e02c6fe9-8fa9-445a-a386-4e555461c390-5431490.jpeg',
    shortDesc: 'Универсальные турэндуро Suzuki DL650, DL1000, V-Strom 800DE, 1050XT.',
    fullDesc: 'Клуб любителей комфортных и сверхнадежных турэндуро Suzuki V-Strom («Стром»). Двигатели SV650/TL1000 с огромным ресурсом, удобная прямая посадка, регулируемое ветровое стекло и кофры для покорения тысяч километров.',
    modelsCovered: ['DL 650 V-Strom (все поколения: круглые фары, клюв, XT)', 'DL 1000 / V-Strom 1050 XT', 'Новый V-Strom 800 DE (рядная двойка)', 'DL 250 V-Strom'],
    keyTopics: ['Корзина сцепления на DL1000 и устранение вибраций', 'Выбор дуг Givi / Heed и защиты картера', 'Устранение турбулентности стекла (кронштейны MadStad)', 'Лучшие туринговые шины'],
    rules: ['Путешествия превыше всего', 'Делимся техническим опытом', 'Без спама'],
    telegramLink: 'https://t.me/vstromrus',
    estimatedMembers: 6100
  },

  // --- Yamaha ---
  {
    slug: 'yamahastarrus',
    username: 'YamahaStarRus',
    title: 'Yamaha Star Club Russia',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/e913a8fc-a212-40f4-9fb5-75e110c4d5fc-5431491.jpeg',
    shortDesc: 'Круизеры Yamaha Star: Drag Star 400/650/1100, Royal Star 1300, Road Star 1600/1700, Raider 1900, Stryker, Bolt.',
    fullDesc: 'Самое душевное и масштабное сообщество владельцев круизеров Yamaha Star. Олдскульные воздушные V-твины с толкателями штанг (Pushrod), карданный и ременной привод, обгонная муфта на Drag Star 1100, харизма чопперов Raider 1900 и бобберов Bolt 950.',
    modelsCovered: ['Drag Star XVS 400 / 650 / 1100 (Classic & Custom)', 'Royal Star XVZ 1300 (V4 Tour Deluxe / Venture)', 'Road Star XV 1600 / 1700 Wild Star', 'XV 1900 Midnight Star / Raider / Stratoliner', 'XVS 1300 Midnight Star / Stryker', 'Yamaha Bolt 950 (XVS950)'],
    keyTopics: ['Замена и усиление обгонной муфты на Drag Star 1100', 'Снятие глушителя при замене масляного фильтра / перенос фильтра', 'Регулировка карбюраторов и подсос воздуха', 'Кожаные кофры, батвинги и хром'],
    rules: ['Традиции мотобратства', 'Взаимопомощь на трассе', 'Уважение к каждому райдеру'],
    telegramLink: 'https://t.me/YamahaStarRus',
    estimatedMembers: 12100
  },
  {
    slug: 'yamahafazerclub',
    username: 'YamahaFazerClub',
    title: 'Yamaha Fazer & MT Club',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/2fc5d3d4-8393-4cf2-8356-6a5ba19c25ff-5431492.jpeg',
    shortDesc: 'Универсалы Yamaha FZ400, FZ6 (S1/S2), FZ8, FZ1 (Fazer) и линейка «Dark Side of Japan» MT-07, MT-09, MT-10.',
    fullDesc: 'Клуб скоростных городских стритфайтеров и спорт-туристов Yamaha. Двигатели от супербайков R6 и R1, дефорсированные под удобный городской диапазон, и хулиганские 2- и 3-цилиндровые моторы CP2/CP3 семейства Master of Torque (MT).',
    modelsCovered: ['FZ6 N / S / Fazer S2 (600cc)', 'FZ1 N / Fazer 1000 (Gen 1 / Gen 2)', 'FZ8 N / Fazer 8', 'MT-07 / Tracer 700 (CP2)', 'MT-09 / Tracer 900 (CP3)', 'MT-10 (CP4 Crossplane)', 'FZ 400 (4YR)'],
    keyTopics: ['Генератор (ротор с магнитами) на FZ1', 'Дроссельные заслонки и чистка форсунок', 'Подвеска и замена пружин в вилке на MT-07/09', 'Идеальный мотоцикл на каждый день и в прохваты'],
    rules: ['Активное общение по делу', 'Без спама и мата', 'Поддержка новичков'],
    telegramLink: 'https://t.me/YamahaFazerClub',
    estimatedMembers: 9500
  },
  {
    slug: 'r1r6club',
    username: 'r1r6club',
    title: 'Yamaha YZF R1 & R6 Club',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/5f9df273-0975-430c-ba72-f6746efab492-5431493.jpeg',
    shortDesc: 'Чистокровные супербайки Yamaha YZF-R1 (включая Crossplane CP4) и YZF-R6.',
    fullDesc: 'Чат пилотов спортивной элиты Yamaha. Неповторимый звук крестообразного коленвала Crossplane R1, 16 000 оборотов ярости на R6, трековые настройки геометрии, слики, прогрев резины и максимальная концентрация на виражах.',
    modelsCovered: ['YZF-R1 (Карб 1998, инжектор 2002–2008, Crossplane 2009+, R1M)', 'YZF-R6 (RJ03, RJ05, RJ11, RJ15, RJ27)', 'YZF-R3 / R7'],
    keyTopics: ['Обслуживание моторов CP4 и зазоры клапанов', 'Трековые настройки демпфера руля (Ohlins/GPR)', 'Гоночные тормозные колодки SBS/Ferodo и диски Brembo', 'Телеметрия картодромов (Лидер, Фирсановка, Moscow Raceway, Игора)'],
    rules: ['Строго для пилотов в полной защите', 'Уважение к трековому этикету', 'Без флуда'],
    telegramLink: 'https://t.me/r1r6club',
    estimatedMembers: 7900
  },
  {
    slug: 'tenereclub',
    username: 'tenereclub',
    title: 'Yamaha Tenere Club (T7 / XT1200Z)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/128dfad0-e25f-4a0b-93ff-eb4185790be6-5431494.jpeg',
    shortDesc: 'Раллийные турэндуро Yamaha Tenere 700 (T700 / World Raid), Super Tenere XT1200Z, XT660Z.',
    fullDesc: 'Клуб покорителей песков, грейдеров и каменистых перевалов на мотоциклах Tenere. Бестселлер раллийного мира Tenere 700 с тяговитым мотором CP2 без лишней душащей электроники и могучий карданный флагман XT1200Z Super Tenere.',
    modelsCovered: ['Tenere 700 (T700 / Rally / World Raid / Extreme)', 'XT 1200 Z Super Tenere (кардан)', 'XT 660 Z Tenere / XT 660 R', 'XTZ 750 Super Tenere (легенда Дакара)'],
    keyTopics: ['Защита картера, радиатора и боковых крышек на T7', 'Усиление подвески (картриджи K-Tech / Ohlins / Andreani)', 'Высокое крыло и раллийная навигация', 'Одиночные и групповые экспедиции в горы'],
    rules: ['Дух приключений и дакаровских побед', 'Обмен GPS-треками', 'Помощь одноклубникам'],
    telegramLink: 'https://t.me/tenereclub',
    estimatedMembers: 6400
  },
  {
    slug: 'yamahatdmrus',
    username: 'YamahaTDMrus',
    title: 'Yamaha TDM Club Russia (850 / 900)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/ca1a58df-eb60-4969-9da8-a0cfa5e2ff74-5431495.jpeg',
    shortDesc: 'Универсальные кроссоверы Yamaha TDM 850 (1 и 2 поколение) и TDM 900.',
    fullDesc: 'Сообщество владельцев родоначальника класса дорожных кроссоверов Yamaha TDM. Большие ходы подвески, тяга с самых низов благодаря 270-градусному коленвалу, отличная ветрозащита и непревзойденная практичность на любых дорогах СНГ.',
    modelsCovered: ['Yamaha TDM 900 (Инжектор, 6-ступка, алюминиевая рама)', 'Yamaha TDM 850-2 (1996–2001, двигатель с TRX850)', 'Yamaha TDM 850-1 (1991–1995, 360-градусный коленвал)'],
    keyTopics: ['Расход масла на TDM 850 и маслосъемные колпачки', 'Эмульсионные трубки и иглы в карбюраторах Mikuni BDST38', 'Проводка и датчик TPS на TDM 900', 'Кофры, свет и комфортный туризм'],
    rules: ['Уважение к легендарному «Тыгыдыму»', 'Делимся мануалами и запчастями', 'Без спама'],
    telegramLink: 'https://t.me/YamahaTDMrus',
    estimatedMembers: 5800
  },
  {
    slug: 'vmaxrus',
    username: 'vmaxrus',
    title: 'Yamaha V-Max Club (1200 / 1700)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/28d0901e-c760-4100-8802-0e964177d61b-5431496.jpeg',
    shortDesc: 'Легендарный «Кувалдолет»: культовый маслбайк Yamaha VMAX 1200 с системой V-Boost и VMAX 1700.',
    fullDesc: 'Чат владельцев легендарной «Кувалды». Мотор V4, система наддува V-Boost, открывающаяся на 6000 об/мин с диким пинком под зад, переделка слабой стоковой рамы и тормозов, а также 200-сильный космический VMAX 1700.',
    modelsCovered: ['VMAX 1200 (Полносил 145 л.с. с V-Boost, канадцы, японцы 2LT/3UF)', 'VMAX 1700 (200 л.с., алюминиевая рама, кардан)'],
    keyTopics: ['Настройка и синхронизация сервопривода V-Boost', 'Усиление рамы (распорки, маятник) и установка колес 17"', 'Тормозные машинки и суппорты от R1 на VMAX 1200', 'Расход топлива и объем бака (фальшбак)'],
    rules: ['Уважение к бешеному характеру Кувалды', 'Технические тонкости от гуру клуба', 'Без флуда'],
    telegramLink: 'https://t.me/vmaxrus',
    estimatedMembers: 5100
  },
  {
    slug: 'clubxjr',
    username: 'clubXJR',
    title: 'Yamaha XJR & FJ Club (400 / 1200 / 1300)',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/6bc992a5-433c-44bf-a9f8-5cf774be090d-5431497.jpeg',
    shortDesc: 'Классические масл-нейкеды воздушного охлаждения Yamaha XJR 1300, XJR 1200, XJR 400 и спорт-туристы FJ1200.',
    fullDesc: 'Клуб истинных ценителей чистой мощи воздушного охлаждения. Самый большой серийный 4-цилиндровый «воздушник» в мире (1300 кубов), двойные амортизаторы Ohlins, классическая круглая фара и непревзойденная харизма настоящего железа.',
    modelsCovered: ['Yamaha XJR 1300 (Карбюраторные RP02/RP06 и инжекторные RP19)', 'Yamaha XJR 1200 (4PU)', 'Yamaha XJR 400 (4HM / RH02J)', 'Yamaha FJ 1200 / FJ 1100'],
    keyTopics: ['Впускные патрубки карбюраторов (манифолды) и их герметичность', 'Обслуживание задних амортизаторов Ohlins', 'Зазоры клапанов и шайбы', 'Масляный радиатор и температурный режим в пробках'],
    rules: ['Любовь к олдскулу и качественному металлу', 'Без спама', 'Делимся опытом'],
    telegramLink: 'https://t.me/clubXJR',
    estimatedMembers: 6200
  },
  {
    slug: 'diversionclub',
    username: 'Diversion_club',
    title: 'Yamaha Diversion & XJ6 Club',
    brand: 'Yamaha',
    category: 'Брендовые',
    image: 'assets/img/5fe25686-e7e2-4ff5-b91c-293e50b86a87-5431498.jpeg',
    shortDesc: 'Надежные и дружелюбные дорожники Yamaha XJ6 Diversion (XJ6N / XJ6F / XJ6S), XJ600, XJ900.',
    fullDesc: 'Сообщество владельцев комфортных и надежных мотоциклов линейки Диверсия. Идеальный баланс мягкой тяги 4-цилиндрового мотора, удобной посадки, защиты от ветра и низкой стоимости владения как для новичков, так и для опытных райдеров.',
    modelsCovered: ['XJ6 Diversion (Naked, S-полуобтекатель, F-полный пластик)', 'XJ 600 S Diversion / XJ 600 N', 'XJ 900 S Diversion (карданный турист)', 'XJ 400 Diversion'],
    keyTopics: ['Надежность и регламентное ТО каждые 10 000 км', 'Установка дуг и центрального кофра', 'Мягкость сцепления и плавность хода', 'Выбор первого взрослого мотоцикла'],
    rules: ['Доброжелательность к новичкам', 'Техническая помощь', 'Без токсичности'],
    telegramLink: 'https://t.me/Diversion_club',
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

// Helper to generate a batch of authentic 30-day summaries if none exists
export function generateSeedSummariesForChat(chat: ChatCatalogItem): ChatDailySummary[] {
  const summaries: ChatDailySummary[] = [];
  const now = new Date();

  // Topic variations based on brand and category
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
    
    // Format Russian date label
    const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const dayLabel = dayFormatter.format(d);

    const msgCount = Math.floor(45 + Math.sin(i * 1.5 + chat.slug.length) * 30 + (i % 5) * 12);
    const userCount = Math.max(8, Math.floor(msgCount * 0.35));

    // Pick 3-4 topics rotationally
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
      createdAt: d.toISOString()
    });
  }

  return summaries;
}

// Function to add a summary for a chat and prune older than 30
export function addChatSummary(chatSlug: string, summary: ChatDailySummary): ChatDailySummary[] {
  let list = chatSummariesStore.get(chatSlug);
  if (!list || list.length === 0) {
    const catalogItem = findChatInCatalog(chatSlug);
    list = catalogItem ? generateSeedSummariesForChat(catalogItem) : [];
  }

  // Remove existing summary for this date if exists
  list = list.filter(s => s.date !== summary.date && s.id !== summary.id);

  // Insert at top (newest first)
  list.unshift(summary);

  // Keep STRICTLY maximum 30 summaries
  if (list.length > 30) {
    list = list.slice(0, 30);
  }

  chatSummariesStore.set(chatSlug, list);
  return list;
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
