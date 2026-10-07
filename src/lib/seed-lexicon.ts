import type { LanguageCode } from "@/lib/languages";

export const SEED_SUBJECTS = ["apple", "cat", "keyboard", "spoon"] as const;
export type SeedSubject = (typeof SEED_SUBJECTS)[number];

export type SeedLine = {
  answer: string;
  taunt: string;
  wrong: [string, string, string];
  bites: [string, string, string];
};

export type SeedPack = Record<SeedSubject, SeedLine>;

function line(
  answer: string,
  taunt: string,
  a: string,
  at: string,
  b: string,
  bt: string,
  c: string,
  ct: string,
): SeedLine {
  return { answer, taunt, wrong: [a, b, c], bites: [at, bt, ct] };
}

export const SEED_LEXICON: Record<LanguageCode, SeedPack> = {
  "zh-TW": {
    apple: line("蘋果", "紅通通還帶果蒂，這也要猜？", "番茄", "番茄蒂是綠萼，不是這種果窪。", "水蜜桃", "水蜜桃有絨毛，這皮光得能照人。", "石榴", "石榴一顆籽都沒露出來。"),
    cat: line("貓", "這張臉這麼正，還想認成別的獸？", "老虎", "老虎有條紋，這是黑白家貓。", "狐狸", "狐狸吻部更尖，耳朵也不長這樣。", "貓頭鷹", "貓頭鷹是圓盤臉加鉤喙，不是這鬍鬚。"),
    keyboard: line("鍵盤", "一排排方鍵擺在桌上，還能是別的？", "計算機", "計算機沒有這麼一整排字母鍵。", "遙控器", "遙控器又圓又少，不是這片鍵帽。", "打字機", "打字機有字臂，不是這種低平鍵帽。"),
    spoon: line("湯匙", "一勺紅粉，勺面都凹成這樣了。", "叉子", "叉子是尖齒，這是圓勺。", "湯勺", "大湯勺更深，這是平淺的匙。", "鍋鏟", "鍋鏟是平片，盛不住這一匙粉。"),
  },
  "zh-CN": {
    apple: line("苹果", "红成这样还带果洼，还要我提示？", "番茄", "番茄顶上是绿萼，不是这种果洼。", "水蜜桃", "水蜜桃有绒毛，这皮光滑。", "石榴", "石榴的籽一颗都没露出来。"),
    cat: line("猫", "这张脸这么标准，还想认成别的？", "老虎", "老虎有条纹，这是黑白家猫。", "狐狸", "狐狸嘴更尖，耳朵也不这样。", "猫头鹰", "猫头鹰是圆脸钩喙，不是这胡子。"),
    keyboard: line("键盘", "一排排方键摆在桌上。", "计算器", "计算器没有一整排字母键。", "遥控器", "遥控器又圆又少，不是这片键帽。", "打字机", "打字机有字锤，不是这种低平键帽。"),
    spoon: line("汤匙", "一勺红粉，勺面都凹成这样了。", "叉子", "叉子是尖齿，这是圆勺。", "大勺", "大勺更深，这是浅匙。", "锅铲", "锅铲是平片，盛不住这一匙。"),
  },
  en: {
    apple: line("Apple", "Red, round, and that little stem dent. Really?", "Tomato", "A tomato wears a green calyx, not this stem hollow.", "Peach", "A peach is fuzzy. This skin is shiny.", "Pomegranate", "Not one seed is showing."),
    cat: line("Cat", "That face is a house cat and you still blinked.", "Tiger", "Tigers wear stripes. This one is black and white.", "Fox", "A fox muzzle is sharper than this.", "Owl", "Owls have a disc face and a hooked beak."),
    keyboard: line("Keyboard", "Rows of square keys on a desk. Come on.", "Calculator", "A calculator does not have a full letter row.", "Remote", "A remote is rounder and much shorter.", "Typewriter", "A typewriter has typebars, not these low keycaps."),
    spoon: line("Spoon", "A heaped spoon of red powder. The bowl is right there.", "Fork", "A fork has tines. This is a round bowl.", "Ladle", "A ladle is deeper. This spoon is shallow.", "Spatula", "A spatula is flat and would spill this powder."),
  },
  es: {
    apple: line("Manzana", "Roja, redonda y con el hoyo del tallo. ¿En serio?", "Tomate", "El tomate lleva cáliz verde, no este hueco.", "Melocotón", "El melocotón tiene pelusa. Esta piel brilla.", "Granada", "No se ve ni una semilla."),
    cat: line("Gato", "Esa cara es de gato doméstico y aún dudas.", "Tigre", "El tigre tiene rayas. Este es blanco y negro.", "Zorro", "El hocico del zorro es más afilado.", "Búho", "El búho tiene cara de disco y pico ganchudo."),
    keyboard: line("Teclado", "Filas de teclas cuadradas sobre la mesa.", "Calculadora", "La calculadora no tiene una fila entera de letras.", "Control remoto", "El control es más corto y redondo.", "Máquina de escribir", "La máquina tiene barras, no estas teclas bajas."),
    spoon: line("Cuchara", "Una cuchara llena de polvo rojo. El cuenco está ahí.", "Tenedor", "El tenedor tiene púas. Esto es un cuenco.", "Cucharón", "El cucharón es más hondo. Esta es rasa.", "Espátula", "La espátula es plana y se le caería el polvo."),
  },
  ja: {
    apple: line("りんご", "赤い実にへこんだへた。まだ迷う？", "トマト", "トマトは緑のへたが残る。このくぼみじゃない。", "桃", "桃は毛がある。この皮はツルツル。", "ザクロ", "粒が一つも見えない。"),
    cat: line("猫", "この顔で別の動物に見える？", "虎", "虎は縞。これは白黒の家猫。", "狐", "狐の鼻先はもっと尖っている。", "フクロウ", "フクロウは丸い顔盤と鉤のくちばし。"),
    keyboard: line("キーボード", "机に並んだ四角いキー。", "電卓", "電卓に文字キーの列はない。", "リモコン", "リモコンは丸くて短い。", "タイプライター", "タイプライターは印字棒がある。"),
    spoon: line("スプーン", "赤い粉をすくった丸い匙。", "フォーク", "フォークは歯。これは丸い皿。", "おたま", "お玉はもっと深い。", "ヘラ", "ヘラは平らで粉は載らない。"),
  },
  ko: {
    apple: line("사과", "빨갛고 과경 자국까지 있는데 아직 고민?", "토마토", "토마토는 녹색 꽃받침이 남는다.", "복숭아", "복숭아는 솜털이 있다. 이 껍질은 매끈하다.", "석류", "씨가 하나도 안 보인다."),
    cat: line("고양이", "이 얼굴이 다른 짐승으로 보이냐.", "호랑이", "호랑이는 줄무늬다. 이건 흑백 집고양이.", "여우", "여우는 주둥이가 더 뾰족하다.", "올빼미", "올빼미는 둥근 얼굴과 갈고리 부리."),
    keyboard: line("키보드", "책상 위 네모 키 줄.", "계산기", "계산기엔 글자 키 한 줄이 없다.", "리모컨", "리모컨은 더 둥글고 짧다.", "타자기", "타자기는 글쇠 팔이 있다."),
    spoon: line("숟가락", "빨간 가루를 담은 둥근 숟가락.", "포크", "포크는 발이 있다. 이건 둥근 오목.", "국자", "국자는 더 깊다.", "뒤집개", "뒤집개는 평평해서 가루가 못 담긴다."),
  },
  pt: {
    apple: line("Maçã", "Vermelha, redonda e com o buraco do cabo. Sério?", "Tomate", "O tomate tem cálice verde, não essa cova.", "Pêssego", "Pêssego tem penugem. Essa casca brilha.", "Romã", "Não aparece nem uma semente."),
    cat: line("Gato", "Essa cara é de gato doméstico e você ainda pisca.", "Tigre", "Tigre tem listras. Este é preto e branco.", "Raposa", "O focinho da raposa é mais fino.", "Coruja", "Coruja tem disco facial e bico em gancho."),
    keyboard: line("Teclado", "Fileiras de teclas quadradas na mesa.", "Calculadora", "Calculadora não tem uma fileira de letras.", "Controle remoto", "O controle é mais curto e redondo.", "Máquina de escrever", "A máquina tem barras, não essas teclas baixas."),
    spoon: line("Colher", "Uma colher cheia de pó vermelho. A concha está aí.", "Garfo", "Garfo tem dentes. Isto é uma concha.", "Concha", "A concha de sopa é mais funda.", "Espátula", "Espátula é chata e derramaria o pó."),
  },
  ru: {
    apple: line("Яблоко", "Красное, круглое, с ямкой у черенка. И ты думаешь?", "Помидор", "У помидора зелёная чашечка, не эта ямка.", "Персик", "Персик пушистый. Эта кожура гладкая.", "Гранат", "Ни одного зёрнышка не видно."),
    cat: line("Кошка", "Это домашняя морда, а ты ищешь другое.", "Тигр", "У тигра полосы. Здесь чёрно-белая кошка.", "Лиса", "У лисы морда острее.", "Сова", "У совы лицевой диск и крючковатый клюв."),
    keyboard: line("Клавиатура", "Ряды квадратных клавиш на столе.", "Калькулятор", "У калькулятора нет ряда букв.", "Пульт", "Пульт короче и круглее.", "Пишущая машинка", "У машинки литеры, не такие низкие клавиши."),
    spoon: line("Ложка", "Ложка красного порошка. Чаша прямо здесь.", "Вилка", "У вилки зубцы. Это круглая чаша.", "Половник", "Половник глубже. Эта ложка мелкая.", "Лопатка", "Лопатка плоская, порошок не удержит."),
  },
  de: {
    apple: line("Apfel", "Rot, rund, mit Stielgrube. Wirklich noch unsicher?", "Tomate", "Die Tomate hat einen grünen Kelch, nicht diese Grube.", "Pfirsich", "Ein Pfirsich ist pelzig. Diese Schale glänzt.", "Granatapfel", "Kein einziges Kernchen ist zu sehen."),
    cat: line("Katze", "Dieses Gesicht ist eine Hauskatze.", "Tiger", "Tiger haben Streifen. Das hier ist schwarz-weiß.", "Fuchs", "Die Fuchsschnauze ist spitzer.", "Eule", "Eulen haben einen Gesichtsschleier und einen Hakenschnabel."),
    keyboard: line("Tastatur", "Reihen eckiger Tasten auf dem Tisch.", "Taschenrechner", "Ein Rechner hat keine Buchstabenreihe.", "Fernbedienung", "Die Fernbedienung ist kürzer und runder.", "Schreibmaschine", "Die Schreibmaschine hat Typenhebel, keine flachen Tasten."),
    spoon: line("Löffel", "Ein Löffel voll rotem Pulver. Die Mulde ist da.", "Gabel", "Eine Gabel hat Zinken. Das ist eine Mulde.", "Schöpfkelle", "Eine Kelle ist tiefer. Dieser Löffel ist flach.", "Pfannenwender", "Ein Wender ist flach und würde das Pulver verlieren."),
  },
  fr: {
    apple: line("Pomme", "Rouge, ronde, avec le creux du pédoncule. Vraiment ?", "Tomate", "La tomate a un calice vert, pas ce creux.", "Pêche", "La pêche est duveteuse. Cette peau brille.", "Grenade", "Pas un seul grain en vue."),
    cat: line("Chat", "Cette tête est un chat de maison.", "Tigre", "Le tigre a des rayures. Ici c’est noir et blanc.", "Renard", "Le museau du renard est plus pointu.", "Hibou", "Le hibou a un disque facial et un bec crochu."),
    keyboard: line("Clavier", "Des rangées de touches carrées sur le bureau.", "Calculatrice", "La calculatrice n’a pas une rangée de lettres.", "Télécommande", "La télécommande est plus courte et ronde.", "Machine à écrire", "La machine a des barres, pas ces touches basses."),
    spoon: line("Cuillère", "Une cuillère de poudre rouge. Le creux est là.", "Fourchette", "La fourchette a des dents. Ceci est un creux.", "Louche", "La louche est plus profonde.", "Spatule", "La spatule est plate et laisserait tomber la poudre."),
  },
  ar: {
    apple: line("تفاحة", "حمراء ومستديرة وفيها تجويف العنق. ما زلت تفكر؟", "طماطم", "الطماطم يعلوها كأس أخضر، لا هذا التجويف.", "خوخ", "الخوخ وبري. هذا القشر لامع.", "رمان", "لا تظهر ولا بذرة."),
    cat: line("قطة", "هذا وجه قطة بيت واضح.", "نمر", "النمر مخطط. هذه بيضاء وسوداء.", "ثعلب", "خطم الثعلب أحدّ.", "بومة", "البومة وجهها قرص ومنقارها معقوف."),
    keyboard: line("لوحة مفاتيح", "صفوف مفاتيح مربعة على المكتب.", "آلة حاسبة", "الآلة الحاسبة بلا صف حروف.", "جهاز تحكم", "جهاز التحكم أقصر وأدور.", "آلة كاتبة", "الآلة الكاتبة لها أذرع حروف، لا هذه المفاتيح المنخفضة."),
    spoon: line("ملعقة", "ملعقة ممتلئة بمسحوق أحمر. التجويف ظاهر.", "شوكة", "الشوكة لها أسنان. هذه تجويف دائري.", "مغرفة", "المغرفة أعمق. هذه ملعقة مسطحة.", "ملعقة قلي", "ملعقة القلي مسطحة ولن تحمل المسحوق."),
  },
  hi: {
    apple: line("सेब", "लाल, गोल, और डंठल का गड्ढा। अब भी सोच?", "टमाटर", "टमाटर पर हरी पंखुड़ी होती है।", "आड़ू", "आड़ू पर रोएँ होते हैं। यह छिलका चिकना है।", "अनार", "एक भी दाना नहीं दिखता।"),
    cat: line("बिल्ली", "यह चेहरा पालतू बिल्ली का है।", "बाघ", "बाघ धारीदार होता है। यह काली-सफेद है।", "लोमड़ी", "लोमड़ी का थूथन ज्यादा नुकीला होता है।", "उल्लू", "उल्लू का चेहरा गोल और चोंच हुक जैसी होती है।"),
    keyboard: line("कीबोर्ड", "मेज़ पर चौकोर कुंजियों की कतारें।", "कैलकुलेटर", "कैलकुलेटर में अक्षरों की पूरी कतार नहीं होती।", "रिमोट", "रिमोट छोटा और गोल होता है।", "टाइपराइटर", "टाइपराइटर में टाइप-बार होते हैं।"),
    spoon: line("चम्मच", "लाल पाउडर से भरा गोल चम्मच।", "काँटा", "काँटे में दाँत होते हैं। यह गोल कटोरी है।", "कलछी", "कलछी गहरी होती है। यह छिछला चम्मच है।", "पलटा", "पलटा चपटा है, पाउडर नहीं टिकेगा।"),
  },
  bn: {
    apple: line("আপেল", "লাল, গোল, আর বোঁটার গর্ত। এখনও ভাবছ?", "টমেটো", "টমেটোর উপরে সবুজ বৃতি থাকে।", "পীচ", "পীচে মখমল আছে। এই খোসা মসৃণ।", "ডালিম", "একটা দানাও দেখা যাচ্ছে না।"),
    cat: line("বিড়াল", "এই মুখটা ঘরের বিড়ালের।", "বাঘ", "বাঘের ডোরা থাকে। এটা কালো-সাদা।", "শেয়াল", "শেয়ালের থুতনি আরও সরু।", "পেঁচা", "পেঁচার মুখ গোল আর ঠোঁট বাঁকানো।"),
    keyboard: line("কীবোর্ড", "টেবিলে চারকোনা কী-এর সারি।", "ক্যালকুলেটর", "ক্যালকুলেটরে অক্ষরের পুরো সারি নেই।", "রিমোট", "রিমোট ছোট আর গোল।", "টাইপরাইটার", "টাইপরাইটারে টাইপ-বার থাকে।"),
    spoon: line("চামচ", "লাল গুঁড়ো ভরা গোল চামচ।", "কাঁটাচামচ", "কাঁটাচামচে দাঁত থাকে। এটা গোল বাটি।", "হাতা", "হাতা আরও গভীর।", "খুন্তি", "খুন্তি চ্যাপটা, গুঁড়ো থাকবে না।"),
  },
  id: {
    apple: line("Apel", "Merah, bulat, dan lekuk tangkainya. Masih ragu?", "Tomat", "Tomat punya kelopak hijau, bukan lekuk ini.", "Persik", "Persik berbulu. Kulit ini licin.", "Delima", "Bijinya tidak kelihatan satu pun."),
    cat: line("Kucing", "Muka ini kucing rumahan.", "Harimau", "Harimau belang. Ini hitam putih.", "Rubah", "Moncong rubah lebih lancip.", "Burung hantu", "Burung hantu berwajah cakram dan paruh bengkok."),
    keyboard: line("Keyboard", "Deretan tombol kotak di meja.", "Kalkulator", "Kalkulator tidak punya deret huruf.", "Remote", "Remote lebih pendek dan bulat.", "Mesin tik", "Mesin tik punya lengan huruf, bukan tuts rendah ini."),
    spoon: line("Sendok", "Sendok penuh bubuk merah. Cekungnya kelihatan.", "Garpu", "Garpu bergigi. Ini cekungan bulat.", "Sendok sayur", "Sendok sayur lebih dalam.", "Spatula", "Spatula datar dan bubuknya tumpah."),
  },
  it: {
    apple: line("Mela", "Rossa, tonda, con la fossetta del picciolo. Davvero?", "Pomodoro", "Il pomodoro ha il calice verde, non questa fossa.", "Pesca", "La pesca è pelosa. Questa buccia luccica.", "Melograno", "Non si vede neanche un seme."),
    cat: line("Gatto", "Questa faccia è di gatto domestico.", "Tigre", "La tigre ha le strisce. Qui è bianco e nero.", "Volpe", "Il muso della volpe è più appuntito.", "Gufo", "Il gufo ha un disco facciale e il becco uncinato."),
    keyboard: line("Tastiera", "File di tasti quadrati sulla scrivania.", "Calcolatrice", "La calcolatrice non ha una fila di lettere.", "Telecomando", "Il telecomando è più corto e tondo.", "Macchina da scrivere", "La macchina ha i martelletti, non questi tasti bassi."),
    spoon: line("Cucchiaio", "Un cucchiaio di polvere rossa. La conca è lì.", "Forchetta", "La forchetta ha i rebbi. Questa è una conca.", "Mestolo", "Il mestolo è più fondo.", "Spatola", "La spatola è piatta e rovescerebbe la polvere."),
  },
  th: {
    apple: line("แอปเปิล", "แดง กลม และมีรอยขั้ว ยังจะลังเล?", "มะเขือเทศ", "มะเขือเทศมีกลีบเขียว ไม่ใช่หลุมแบบนี้", "พีช", "พีชมีขน เปลือกนี้เรียบ", "ทับทิม", "ไม่เห็นเมล็ดสักเม็ด"),
    cat: line("แมว", "หน้านี้คือแมวบ้านชัด ๆ", "เสือ", "เสือมีลาย นี่ขาวดำ", "สุนัขจิ้งจอก", "จมูกจิ้งจอกแหลมกว่า", "นกฮูก", "นกฮูกหน้ากลม จะงอยงุ้ม"),
    keyboard: line("คีย์บอร์ด", "ปุ่มสี่เหลี่ยมเรียงบนโต๊ะ", "เครื่องคิดเลข", "เครื่องคิดเลขไม่มีแถวตัวอักษร", "รีโมต", "รีโมตสั้นและกลมกว่า", "เครื่องพิมพ์ดีด", "เครื่องพิมพ์ดีดมีแขนกดอักษร"),
    spoon: line("ช้อน", "ช้อนตักผงแดง แอ่งกลมอยู่ตรงนั้น", "ส้อม", "ส้อมมีซี่ นี่คือแอ่งกลม", "กระบวย", "กระบวยลึกกว่า", "ตะหลิว", "ตะหลิวแบน ผงอยู่ไม่ได้"),
  },
  pl: {
    apple: line("Jabłko", "Czerwone, okrągłe, z dołkiem po ogonku. Naprawdę?", "Pomidor", "Pomidor ma zielony kielich, nie ten dołek.", "Brzoskwinia", "Brzoskwinia jest meszkowata. Ta skórka błyszczy.", "Granat", "Nie widać ani jednego ziarna."),
    cat: line("Kot", "Ta morda to kot domowy.", "Tygrys", "Tygrys ma pasy. Tu jest czarno-biały.", "Lis", "Pysk lisa jest ostrzejszy.", "Sowa", "Sowa ma szlarę i zakrzywiony dziób."),
    keyboard: line("Klawiatura", "Rzędy kwadratowych klawiszy na biurku.", "Kalkulator", "Kalkulator nie ma rzędu liter.", "Pilot", "Pilot jest krótszy i bardziej okrągły.", "Maszyna do pisania", "Maszyna ma czcionki, nie takie niskie klawisze."),
    spoon: line("Łyżka", "Łyżka czerwonego proszku. Miseczka jest na widoku.", "Widelec", "Widelec ma zęby. To okrągła miseczka.", "Chochla", "Chochla jest głębsza.", "Łopatka", "Łopatka jest płaska i rozsypałaby proszek."),
  },
  uk: {
    apple: line("Яблуко", "Червоне, кругле, з ямкою біля плодоніжки. І ти думаєш?", "Помідор", "У помідора зелена чашечка, не ця ямка.", "Персик", "Персик пухнастий. Ця шкірка гладка.", "Гранат", "Жодної зернини не видно."),
    cat: line("Кіт", "Це морда домашнього кота.", "Тигр", "У тигра смуги. Тут чорно-білий.", "Лисиця", "Морда лисиці гостріша.", "Сова", "У сови лицьовий диск і гачкуватий дзьоб."),
    keyboard: line("Клавіатура", "Ряди квадратних клавіш на столі.", "Калькулятор", "У калькулятора немає ряду літер.", "Пульт", "Пульт коротший і кругліший.", "Друкарська машинка", "У машинки літери, не такі низькі клавіші."),
    spoon: line("Ложка", "Ложка червоного порошку. Чаша ось тут.", "Виделка", "У виделки зубці. Це кругла чаша.", "Ополоник", "Ополоник глибший.", "Лопатка", "Лопатка пласка і не втримає порошок."),
  },
  nl: {
    apple: line("Appel", "Rood, rond, met steelkuiltje. Echt nog twijfelen?", "Tomaat", "Een tomaat heeft een groene kelk, niet dit kuiltje.", "Perzik", "Een perzik is donzig. Deze schil glanst.", "Granaatappel", "Geen enkel pitje te zien."),
    cat: line("Kat", "Dit gezicht is een huiskat.", "Tijger", "Een tijger heeft strepen. Dit is zwart-wit.", "Vos", "De vossensnuit is spitser.", "Uil", "Een uil heeft een sluier en een haaksnavel."),
    keyboard: line("Toetsenbord", "Rijen vierkante toetsen op het bureau.", "Rekenmachine", "Een rekenmachine heeft geen letterrij.", "Afstandsbediening", "De afstandsbediening is korter en ronder.", "Schrijfmachine", "Een schrijfmachine heeft typearmen, niet deze lage toetsen."),
    spoon: line("Lepel", "Een lepel rode poeder. De holte ligt er.", "Vork", "Een vork heeft tanden. Dit is een ronde holte.", "Soepopscheplepel", "Een opscheplepel is dieper.", "Spatel", "Een spatel is plat en morst dit poeder."),
  },
  el: {
    apple: line("Μήλο", "Κόκκινο, στρογγυλό, με το λακκάκι του κοτσανιού.", "Ντομάτα", "Η ντομάτα έχει πράσινο κάλυκα, όχι αυτό το λακκάκι.", "Ροδάκινο", "Το ροδάκινο έχει χνούδι. Αυτή η φλούδα γυαλίζει.", "Ρόδι", "Δεν φαίνεται ούτε ένας σπόρος."),
    cat: line("Γάτα", "Αυτό το πρόσωπο είναι κατοικίδια γάτα.", "Τίγρη", "Η τίγρη έχει ρίγες. Εδώ είναι ασπρόμαυρη.", "Αλεπού", "Το ρύγχος της αλεπούς είναι πιο μυτερό.", "Κουκουβάγια", "Η κουκουβάγια έχει δίσκο προσώπου και γαμψό ράμφος."),
    keyboard: line("Πληκτρολόγιο", "Σειρές τετράγωνων πλήκτρων στο γραφείο.", "Αριθμομηχανή", "Η αριθμομηχανή δεν έχει σειρά γραμμάτων.", "Τηλεχειριστήριο", "Το τηλεχειριστήριο είναι κοντύτερο και στρογγυλό.", "Γραφομηχανή", "Η γραφομηχανή έχει βραχίονες, όχι αυτά τα χαμηλά πλήκτρα."),
    spoon: line("Κουτάλι", "Ένα κουτάλι κόκκινη σκόνη. Το κοίλο είναι εκεί.", "Πιρούνι", "Το πιρούνι έχει δόντια. Αυτό είναι κοίλο.", "κουτάλα", "Η κουτάλα είναι βαθύτερη.", "Σπάτουλα", "Η σπάτουλα είναι επίπεδη και θα έχυνε τη σκόνη."),
  },
  cs: {
    apple: line("Jablko", "Červené, kulaté a s důlkem po stopce. Vážně?", "Rajče", "Rajče má zelený kalich, ne tenhle důlek.", "Broskev", "Broskev je chlupatá. Tahle slupka se leskne.", "Granátové jablko", "Není vidět ani jedno zrníčko."),
    cat: line("Kočka", "Tohle je čumák domácí kočky.", "Tygr", "Tygr má pruhy. Tady je černobílá.", "Liška", "Liščí čenich je špičatější.", "Sova", "Sova má závoj a hákovitý zobák."),
    keyboard: line("Klávesnice", "Řady hranatých kláves na stole.", "Kalkulačka", "Kalkulačka nemá řadu písmen.", "Ovladač", "Ovladač je kratší a kulatější.", "Psací stroj", "Psací stroj má typové páky, ne tyhle nízké klávesy."),
    spoon: line("Lžíce", "Lžíce červeného prášku. Miska je vidět.", "Vidlička", "Vidlička má hroty. Tohle je kulatá miska.", "Naběračka", "Naběračka je hlubší.", "Stěrka", "Stěrka je plochá a prášek neudrží."),
  },
  sv: {
    apple: line("Äpple", "Rött, runt och med skafthåla. På riktigt?", "Tomat", "Tomaten har ett grönt foder, inte den här gropen.", "Persika", "Persikan är luddig. Det här skalet glänser.", "Granatäpple", "Inte ett enda kärnhus syns."),
    cat: line("Katt", "Det här ansiktet är en huskatt.", "Tiger", "Tigern har ränder. Den här är svartvit.", "Räv", "Rävens nos är spetsigare.", "Uggla", "Ugglan har en slöja och en krokig näbb."),
    keyboard: line("Tangentbord", "Rader av fyrkantiga tangenter på bordet.", "Miniräknare", "En miniräknare har ingen bokstavsrad.", "Fjärrkontroll", "Fjärrkontrollen är kortare och rundare.", "Skrivmaskin", "Skrivmaskinen har typarmar, inte de här låga tangenterna."),
    spoon: line("Sked", "En sked rött pulver. Skålen syns.", "Gaffel", "En gaffel har spetsar. Det här är en rund skål.", "Slev", "En slev är djupare.", "Stekspade", "En stekspade är platt och tappar pulvret."),
  },
  ro: {
    apple: line("Măr", "Roșu, rotund și cu gropița codiței. Serios?", "Roșie", "Roșia are caliciu verde, nu groapa asta.", "Piersică", "Piersica e pufoasă. Coaja asta lucește.", "Rodie", "Nu se vede niciun sâmbure."),
    cat: line("Pisică", "Fața asta e de pisică de casă.", "Tigru", "Tigrul are dungi. Aici e alb-negru.", "Vulpe", "Botul vulpii e mai ascuțit.", "Bufniță", "Bufnița are disc facial și cioc cârlig."),
    keyboard: line("Tastatură", "Rânduri de taste pătrate pe birou.", "Calculator de buzunar", "Calculatorul nu are un rând de litere.", "Telecomandă", "Telecomanda e mai scurtă și rotundă.", "Mașină de scris", "Mașina are bare de tipar, nu aceste taste joase."),
    spoon: line("Lingură", "O lingură de pulbere roșie. Concava e aici.", "Furculiță", "Furculița are dinți. Asta e o concavă.", "Polonic", "Polonicul e mai adânc.", "Spatulă", "Spatula e plată și ar vărsa pulberea."),
  },
  hu: {
    apple: line("Alma", "Piros, kerek, szárral a gödrében. Tényleg?", "Paradicsom", "A paradicsomon zöld csésze van, nem ez a gödör.", "Őszibarack", "Az őszibarack molyhos. Ez a héj fényes.", "Gránátalma", "Egy szem sem látszik."),
    cat: line("Macska", "Ez a pofa házi macska.", "Tigris", "A tigris csíkos. Ez fekete-fehér.", "Róka", "A róka orra hegyesebb.", "Bagoly", "A bagolynak arcfátyla és kampós csőre van."),
    keyboard: line("Billentyűzet", "Négyzetes billentyűk sorai az asztalon.", "Számológép", "A számológépen nincs betűsor.", "Távirányító", "A távirányító rövidebb és kerekebb.", "Írógép", "Az írógépnek típuskarjai vannak, nem ilyen lapos billentyűi."),
    spoon: line("Kanál", "Egy kanál vörös por. A mélyedés ott van.", "Villa", "A villának ágai vannak. Ez kerek mélyedés.", "Merőkanál", "A merőkanál mélyebb.", "Spatula", "A spatula lapos, a por lecsúszna."),
  },
  he: {
    apple: line("תפוח", "אדום, עגול, ועם שקע העוקץ. באמת?", "עגבנייה", "לעגבנייה גביע ירוק, לא השקע הזה.", "אפרסק", "לאפרסק פלומה. הקליפה הזו חלקה.", "רימון", "לא רואים אפילו גרעין אחד."),
    cat: line("חתול", "הפנים האלה של חתול בית.", "נמר", "לנמר יש פסים. כאן שחור-לבן.", "שועל", "החוטם של השועל חד יותר.", "ינשוף", "לינשוף דיסק פנים ומקור מעוקל."),
    keyboard: line("מקלדת", "שורות של מקשים מרובעים על השולחן.", "מחשבון", "למחשבון אין שורת אותיות.", "שלט", "השלט קצר ועגול יותר.", "מכונת כתיבה", "למכונת כתיבה יש זרועות אות, לא המקשים הנמוכים האלה."),
    spoon: line("כף", "כף מלאה אבקה אדומה. השקע שם.", "מזלג", "למזלג יש שיניים. זה שקע עגול.", "מצקת", "המצקת עמוקה יותר.", "מרית", "המרית שטוחה והאבקה תיפול."),
  },
  ms: {
    apple: line("Epal", "Merah, bulat, dan lekuk tangkainya. Masih fikir?", "Tomato", "Tomato ada kaliks hijau, bukan lekuk ini.", "Pic", "Pic berbulu. Kulit ini licin.", "Delima", "Biji langsung tak nampak."),
    cat: line("Kucing", "Muka ini kucing rumah.", "Harimau", "Harimau berbelang. Ini hitam putih.", "Musang", "Muncung musang lebih tirus.", "Burung hantu", "Burung hantu bermuka cakera dan paruh bengkok."),
    keyboard: line("Papan kekunci", "Barisan kekunci segi empat di meja.", "Kalkulator", "Kalkulator tiada barisan huruf.", "Alat kawalan jauh", "Alat kawalan lebih pendek dan bulat.", "Mesin taip", "Mesin taip ada lengan huruf, bukan kekunci rendah ini."),
    spoon: line("Sudu", "Sudu penuh serbuk merah. Lekuknya nyata.", "Garpu", "Garpu bergigi. Ini lekuk bulat.", "Senduk", "Senduk lebih dalam.", "Spatula", "Spatula rata dan serbuk tumpah."),
  },
  fa: {
    apple: line("سیب", "قرمز، گرد، و با گودی دم. هنوز شک داری؟", "گوجه", "گوجه کاسبرگ سبز دارد، نه این گودی.", "هلو", "هلو کرک دارد. این پوست براق است.", "انار", "حتی یک دانه دیده نمی‌شود."),
    cat: line("گربه", "این صورت یک گربه خانگی است.", "ببر", "ببر راه راه است. این سیاه و سفید است.", "روباه", "پوزه روباه تیزتر است.", "جغد", "جغد صفحه صورت و منقار قلاب دارد."),
    keyboard: line("صفحه‌کلید", "ردیف کلیدهای چهارگوش روی میز.", "ماشین‌حساب", "ماشین‌حساب ردیف حرف ندارد.", "ریموت", "ریموت کوتاه‌تر و گردتر است.", "ماشین تحریر", "ماشین تحریر بازوی حروف دارد، نه این کلیدهای کوتاه."),
    spoon: line("قاشق", "یک قاشق پودر قرمز. گودی‌اش پیداست.", "چنگال", "چنگال دندانه دارد. این گودی گرد است.", "ملاقه", "ملاقه عمیق‌تر است.", "کفگیر", "کفگیر تخت است و پودر را نگه نمی‌دارد."),
  },
  fil: {
    apple: line("Mansanas", "Pula, bilog, at may butas ng tangkay. Seryoso?", "Kamatis", "May berdeng kaliks ang kamatis, hindi itong butas.", "Melokoton", "Mabalahibo ang melokoton. Makintab ang balat na ito.", "Granada", "Walang ni isang buto na nakikita."),
    cat: line("Pusa", "Mukha ito ng pusang bahay.", "Tigre", "May guhit ang tigre. Itim at puti ito.", "Soro", "Mas matulis ang nguso ng soro.", "Kuwago", "May disc na mukha at baluktot na tuka ang kuwago."),
    keyboard: line("Keyboard", "Hanay ng parisukat na pindutan sa mesa.", "Calculator", "Walang hanay ng letra ang calculator.", "Remote", "Mas maikli at bilog ang remote.", "Typewriter", "May typebar ang typewriter, hindi ang mabababang keycap na ito."),
    spoon: line("Kutsara", "Kutsarang puno ng pulang pulbos. Kita ang hukay.", "Tinidor", "May ngipin ang tinidor. Bilog na hukay ito.", "Sandok", "Mas malalim ang sandok.", "Spatula", "Patag ang spatula at matatapon ang pulbos."),
  },
  da: {
    apple: line("Æble", "Rødt, rundt og med stilkhul. Virkelig?", "Tomat", "Tomaten har et grønt bæger, ikke det hul.", "Fersken", "En fersken er lodden. Den her skræl skinner.", "Granatæble", "Ikke et eneste kerne er synligt."),
    cat: line("Kat", "Det ansigt er en huskat.", "Tiger", "Tigeren har striber. Den her er sort-hvid.", "Ræv", "Rævens snude er spidsere.", "Ugle", "Uglen har en slør og et krognet næb."),
    keyboard: line("Tastatur", "Rækker af firkantede taster på bordet.", "Lommeregner", "En lommeregner har ingen bogstavrække.", "Fjernbetjening", "Fjernbetjeningen er kortere og rundere.", "Skrivemaskine", "Skrivemaskinen har typearme, ikke de her lave taster."),
    spoon: line("Ske", "En ske rødt pulver. Skålen er der.", "Gaffel", "En gaffel har tænder. Det her er en rund skål.", "Øse", "En øse er dybere.", "Paletkniv", "En paletkniv er flad og taber pulveret."),
  },
  fi: {
    apple: line("Omena", "Punainen, pyöreä ja kannan kuoppa. Ihanko totta?", "Tomaatti", "Tomaatissa on vihreä verhiö, ei tämä kuoppa.", "Persikka", "Persikka on nukkapintainen. Tämä kuori kiiltää.", "Granaattiomena", "Yhtään siementä ei näy."),
    cat: line("Kissa", "Tämä naama on kotikissa.", "Tiikeri", "Tiikerillä on raidat. Tämä on mustavalkoinen.", "Kettu", "Ketun kuono on terävämpi.", "Pöllö", "Pöllöllä on kasvolevy ja koukkunokka."),
    keyboard: line("Näppäimistö", "Neliskulmaisia näppäimiä riveissä pöydällä.", "Laskin", "Laskimessa ei ole kirjainriviä.", "Kaukosäädin", "Kaukosäädin on lyhyempi ja pyöreämpi.", "Kirjoituskone", "Kirjoituskoneessa on tyyppivarsia, ei näitä matalia näppäimiä."),
    spoon: line("Lusikka", "Lusikallinen punaista jauhetta. Kuoppa näkyy.", "Haarukka", "Haarukassa on piikit. Tämä on pyöreä kuoppa.", "Kauha", "Kauha on syvempi.", "Lasta", "Lasta on litteä eikä pidä jauhetta."),
  },
};

export function lexiconQuiz(language: LanguageCode, subject: SeedSubject): SeedLine {
  return SEED_LEXICON[language][subject];
}
