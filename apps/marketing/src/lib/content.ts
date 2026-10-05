/** All site copy, taken from the "Brain Matters" brochure. */

export const CONTACT = {
  website: "www.whatboutme.com",
  websiteHref: "https://www.whatboutme.com",
  email: "share@whatboutme.com",
  phones: [
    { number: "+971 56 546 4014", place: "Dubai", href: "tel:+971565464014" },
    { number: "+91 81475 96511", place: "India", href: "tel:+918147596511" },
  ],
  social: "@whatboutme11",
};

/** Home page story, in Roweena's words, from whatboutme.com. */
export const LIVED_IT = {
  quote:
    "The moment I fell in love with my condition and my BRAIN, I chased it to become its best version; only to realize, it changed everything for the BETTER!",
  heading: "I Have Been Where You Are",
  questions:
    "Where is my life going with all the trauma, anxiety, depression, and confusion battling in my brain? I often wondered if there was any anxiety and depression support available for someone like me. Will I see better days? Why go through this pain? When will I be free of my addictions and live with purpose? Who can help me navigate this mental health journey?",
  answer:
    "Through my struggles with bipolar management, I found the path to becoming a Brain Health Coach, guiding others towards healing and fulfillment.",
};

/** Profiles linked from whatboutme.com. */
export const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/whatboutme11/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/whatboutme-%F0%9F%92%9B-71991162" },
  { label: "YouTube", href: "https://www.youtube.com/channel/UCVBNr7Okri3BOUMMzxN6cyQ" },
  { label: "WhatsApp", href: "https://wa.me/971565464014" },
];

export const DISCLAIMER =
  "My coaching services are not offered as a substitute for professional mental health care or medical care and are not intended to diagnose, treat or cure any mental health or medical conditions.";

/** Roweena's own story, in her words, from the About Me page of whatboutme.com. */
export const STORY = [
  "As a mother of two beautiful daughters and an Indian by blood, I reside in the ever-visionary and passionate city of Dubai, UAE & Mangalore, India.",
  "My life is fulfilling now, despite the challenges I have faced, particularly in my mental health journey with Bipolar Disorder. While my life is far from perfect, I have found a way to make it work for me. I always seek help and needed an entire army to support me while learning the essential truth that I WAS ENOUGH!",
  "I have faith in my life experiences and wish to share my journey on how I overcame bipolar disorder, which once consumed my everyday life.",
  "Through effective bipolar management, I have learned to manage my condition and now live meds-free. I also believe in the importance of anxiety and depression support, as it can empower others to navigate their struggles.",
  "Additionally, I am passionate about Brain Health and sharing knowledge to help humanity reach their true potential. A big shoutout to all who have contributed to my journey, especially my family, my closest friends, my beautiful girls!",
];

export const FUTURE_LENS = [
  "I wish to see a world where no taboo exists around mental health and recovery from anxiety and depression support is much faster and more effective.",
  "One enjoys LIFE with all the pain and pleasures that come with it, both of which contribute to enriching our mental health journey.",
  "The right tools and tricks are provided to caregivers, enabling them to make their loved ones feel cherished despite the emotional whirlwinds of daily life.",
  "A touch of humor can enhance our journey, especially as we deal with traumas! What is a day without a bit of laughter to balance out life?",
  "Creating a space where people can freely express themselves without judgment is essential.",
  "A Brain Health Coach who has experienced similar challenges can truly understand your pain and offer personal coaching services, including bipolar management strategies, to help you navigate through it.",
];

/** Shown on the About page, from whatboutme.com. */
export const BADGES = [
  { file: "badge-brain-coach.png", alt: "Brain Coach badge" },
  { file: "badge-cpd.webp", alt: "CPD accreditation badge" },
  { file: "cert-brain-academy.png", alt: "Brain Academy certificate" },
  { file: "cert-abnlp.png", alt: "ABNLP certificate" },
  { file: "cert-2.png", alt: "Certificate" },
  { file: "cert-1.png", alt: "Certificate" },
];


/** Enquiry buttons open the contact form, which saves to the admin CRM. */
export const ENQUIRE_HREF = "/contact";

export const NAV_LINKS = [
  { label: "Courses", href: "/courses" },
  { label: "About", href: "/about" },
  { label: "Certification", href: "#certification" },
  { label: "FAQ", href: "#faq" },
];

/** Extra blocks shown on a course's own page. */
type CourseExtras = {
  sections?: { title: string; text: string }[];
  gallery?: { src: string; alt: string }[];
  links?: { label: string; href: string }[];
};

// Text and images come from whatboutme.com; the corporate workshop keeps the
// brochure wording and a stock photo because the site has no page for it.
export const COURSES: ({
  slug: string;
  title: string;
  duration: string;
  meta: string;
  image: string;
  alt: string;
  flagship: boolean;
  body: string;
  inPerson: string;
  online: string;
  points: string[];
} & CourseExtras)[] = [
  {
    slug: "11-steps-to-you",
    title: "11 Steps to You Programme",
    duration: "12 classes",
    meta: "25 CPD hours (UK) · Live online",
    image: "/site/steps-2026.png",
    alt: "Sample certificate of achievement for the 11 Steps to You Program",
    flagship: true,
    body: "Get certified for working on yourself and earn 25 CPD hours (UK). You will leave this program feeling liberated from your old thoughts, with a rewired brain for action, embracing the self you are meant to be.",
    inPerson: "",
    online: "12 live classes · 2 hours each · Saturdays, 11am India / 9:30am UAE · Starts 26 September 2026",
    points: [
      "The TRUTH about yourself",
      "Your BASELINE: where you are in life right now",
      "DAILY LIFE: the activities, values and triggers that govern your decisions",
      "An intro to the BRAIN and its possibilities of rewiring itself",
      "An exam with an 80% pass mark",
      "Your personal development growth plan",
    ],
    sections: [
      {
        title: "The Approach",
        text: "I believe that every individual has the potential to live a fulfilling and purposeful life. My approach is centered around helping my clients cultivate self-awareness through coaching, identify their values and goals, and create actionable steps towards achieving goals. By integrating brain health education and personal growth tools into my practice, I am committed to providing a safe and non-judgmental space for my clients to explore their inner world and work towards their desired outcomes.",
      },
      {
        title: "Why whatboutme?",
        text: "I too was once caught in a web of family, career, medications, and mental disorders, living a narrative that wasn't truly mine. Through years of personal growth tools, resilience, and recovery, I now embrace a medication-free life, living my dream that is uniquely my own. I have lived this journey, and now I coach others in their own paths. You can change your life with the carefully curated resources, brain health education, and self-awareness coaching provided.",
      },
      {
        title: "The Outcome",
        text: "Upon achieving 80% passing marks on the exam and submitting your personal development growth plan, you will be awarded a Certification of Completion and 25 hours of Continuing Professional Development (CPD), marking the start of the life you have always dreamed of.",
      },
    ],
    gallery: [
      { src: "/site/steps-agenda.png", alt: "11 Steps to U Program agenda: Truth, Baseline, Daily Life, Brain Health, Renewed You" },
      { src: "/site/steps-flyer.png", alt: "11 Steps to YOU Program flyer" },
      { src: "/site/steps-banner.png", alt: "11 Steps to U Program" },
    ],
  },
  {
    slug: "resilience-speaker",
    title: "Resilience Speaker + Activity",
    duration: "2 hrs / 1 hr",
    meta: "Conferences · Offsites · Campuses",
    image: "/site/home-hero.png",
    alt: "Roweena Britto beside the words Let's Talk Brain Health",
    flagship: false,
    body: "Why only the top 1%? Everyone deserves a brain that performs. Building focused, resilient and high-performing teams, because the brains of your people are your biggest asset.",
    inPerson: "2 hours · Speaker 60 min · Activity 30 min · Q&A 15–30 min",
    online: "1 hour · Speaker assignment, delivered live",
    points: [
      "A personal resilience story",
      "Brain intro, in simple language",
      "Brain train vs brain drain",
      "Brain health vs mental health",
      "Building real confidence",
      "Thoughts leading to behaviours",
    ],
    sections: [
      {
        title: "Corporate Sessions",
        text: "In today's fast-paced corporate environment, constant pressure, multitasking, and digital overload silently drain cognitive energy. Brain health is no longer optional; it's essential for productivity, clarity, emotional intelligence, and sustainable performance.",
      },
      {
        title: "For Everyone",
        text: "Brain health isn't just for executives or athletes; it's vital for parents, students, professionals, caregivers, creatives, and anyone navigating modern life. Our workshops are designed to help everyday people understand their brain, manage stress, and regulate emotions, without jargon, pressure, or perfection.",
      },
      {
        title: "I Lived It, So I Coach It",
        text: "Prevention better than burnout? A simple talk, with an intention to help understand and not fix. An understanding to promote growth and not judge. From one human to the other, from one experience of failure to resilience.",
      },
    ],
    gallery: [
      { src: "/site/speaker-flyer.png", alt: "Let Us Talk Brain Health: corporate wellness talks, workshops and team building with Roweena Britto" },
    ],
  },
  {
    slug: "vision-board-workshop",
    title: "Vision Board Workshop",
    duration: "2–3 hrs / 1 hr",
    meta: "Up to 20 pax · Kit provided",
    image: "/site/vision-5.jpg",
    alt: "The whatboutme Vision Board Kit laid out on a table",
    flagship: false,
    body: "Thought. Note. Design. Action. Behaviour. Vision board workshops help your brain to remain focused and actively hunt for ways to achieve your goals.",
    inPerson: "2–3 hours · Up to 20 pax · Kit provided · Activity space required",
    online: "1 hour · Kits purchased in advance by client",
    points: [
      "Why the brain treats a seen goal differently from a stated one",
      "Goals framed so they survive contact with an ordinary week",
      "Everything needed to build a board that leaves the room with them",
      "Optional quarterly or monthly check-ins, at additional cost",
    ],
    sections: [
      {
        title: "My Approach",
        text: "Let's make it simple! When your brain doesn't know where it needs to go, confusion creeps in, leading to overthinking, a lack of worth, and definitely boredom. This is where group training and personal sessions come into play, enhancing your brain health and promoting mental wellness. Whether you are a group, a corporate or just a community that wants to grow, let's build our dreams through a clear vision.",
      },
      {
        title: "The Vision Board Kit",
        text: "I have designed the Vision Board Kit through neuroscience, frameworks and lived experience. All you need is your dreams, goals, and the will to make a difference in your life through mental wellness. Buy the kit to visualize your success and enhance your brain health.",
      },
    ],
    gallery: [
      { src: "/site/vision-1.jpg", alt: "Inside the Vision Board Kit: picture sheets, stickers and a thank-you card" },
      { src: "/site/vision-2.jpg", alt: "Vision Board Kit contents" },
      { src: "/site/vision-3.jpg", alt: "Vision Board Kit contents" },
      { src: "/site/vision-4.jpg", alt: "Vision Board Kit contents" },
    ],
    links: [{ label: "Buy the Kit on Amazon.in", href: "https://www.amazon.in/dp/B0HKNDHVL3" }],
  },
  {
    slug: "corporate-workshop",
    title: "One-Day Corporate Workshop",
    duration: "1 day",
    meta: "Certificate of participation",
    image: "https://images.unsplash.com/photo-1568992688065-536aad8a12f6?auto=format&fit=crop&w=1200&q=75",
    alt: "A team sitting around a table in a workshop",
    flagship: false,
    body: "A condensed day for organisations that need the shift without the full programme commitment.",
    inPerson: "1 day · Certificate of participation",
    online: "1 day · Certificate of participation",
    points: [
      "A certificate of participation is issued",
      "No exams or CPD hours attached",
    ],
  },
];

export const COURSE_FACTS = [
  { label: "Duration", value: "12 classes · 2 hours each" },
  { label: "Delivery", value: "In person or online" },
  { label: "Structure", value: "11 modules, each closing with a short quiz" },
  { label: "Assessment", value: "Final exam and a closing 1:1 with Roweena" },
  { label: "Certificate", value: "CPD accredited · 25 CPD hours" },
];

export const FAQS = [
  {
    q: "How long is the course?",
    a: "Twelve live online classes of two hours each, on Saturdays at 11am India / 9:30am UAE. The next programme starts on 26 September 2026.",
  },
  {
    q: "How do I earn the certificate?",
    a: "Each of the 11 modules closes with a short quiz. Pass the final exam with 80%, submit your personal development growth plan and have a closing 1:1 call with Roweena. You are then awarded a certificate of completion and 25 CPD hours.",
  },
  {
    q: "Who is the course for?",
    a: "Individuals, teams, leaders and students: anyone who keeps everyone else standing.",
  },
  {
    q: "Is there a shorter option?",
    a: "Yes. The one-day Corporate Workshop issues a certificate of participation, with no exams or CPD hours attached.",
  },
];

// PLACEHOLDERS: the brochure has no testimonials. Replace every entry with a
// real quote, name and role before the site goes live.
export const TESTIMONIALS = [
  {
    quote: "Participant quote goes here. Two or three sentences about what changed for them after the programme.",
    name: "Participant name",
    role: "Role, organisation",
  },
  {
    quote: "Participant quote goes here. Two or three sentences about what changed for them after the session.",
    name: "Participant name",
    role: "Role, organisation",
  },
  {
    quote: "Participant quote goes here. Two or three sentences about what changed for their team after the workshop.",
    name: "Participant name",
    role: "Role, organisation",
  },
];

export const FOUR_IDEAS = [
  "Brain health vs mental health",
  "Brain train vs brain drain",
  "Thoughts leading to behaviours",
  "Building real confidence",
];

export const OFFERINGS = [
  {
    duration: "2 hrs / 1 hr",
    title: "Resilience Speaker + Activity",
    body: "A lived resilience story, the brain explained simply, and an activity that lands it in the room.",
    audience: "Conferences · Offsites · Campuses",
    href: "#speaker",
    flagship: false,
  },
  {
    duration: "12 classes",
    title: "11 Steps to You Programme",
    body: "The flagship. Eleven steps through truth, acceptance and neuroscience, certified with 25 CPD hours.",
    audience: "Individuals · Teams · Leaders",
    href: "#curriculum",
    flagship: true,
  },
  {
    duration: "2–3 hrs / 1 hr",
    title: "Vision Board Workshop",
    body: "Goal setting with the neuroscience switched on, plus a kit that leaves the room with them.",
    audience: "Up to 20 pax · Kit provided",
    href: "#vision-board",
    flagship: false,
  },
];

export const STATS = [
  { value: "25", label: "CPD hours" },
  { value: "18", label: "Yrs corporate" },
  { value: "02", label: "Countries licensed" },
  { value: "11", label: "Steps, one you" },
];

export const STEP_LABELS: Record<number, string> = {
  1: "Truth",
  3: "Acceptance",
  5: "Neuroscience",
  7: "Confidence",
  11: "Purpose",
};

export const PROGRAMME_FACTS = [
  { label: "Format", value: "12 classes", body: "2 hours each, live online on Saturdays" },
  { label: "Starts", value: "26 Sep 2026", body: "11am India · 9:30am UAE" },
  { label: "Accreditation", value: "25 CPD hours", body: "CPD accredited certification (UK)" },
];

export const LEAVE_WITH = [
  {
    title: "A certificate that means something",
    body: "CPD accredited, earned through the work rather than attendance.",
  },
  {
    title: "Language for your own brain",
    body: "Words for what is happening to you, usable long after the last class.",
  },
  {
    title: "A closing 1:1 with Roweena",
    body: "The last step is a conversation rather than a form, held before certification.",
  },
];

export const GROUND_COVERED = [
  "Your own truth, named without editing it for anyone else in the room",
  "Acceptance as a working skill, not a slogan",
  "The brain, in language you can repeat to a colleague afterwards",
  "Brain train vs brain drain, applied to your actual week",
  "Thoughts leading to behaviours, catching the chain before it runs",
  "Confidence built on evidence instead of performance",
  "Purpose, arrived at rather than announced",
];

export const CERTIFICATION = [
  "11 modules, each closing with a short quiz",
  "A final exam with an 80% pass mark",
  "Modules unlock in sequence, with no skipping ahead",
  "Attendance across all twelve classes is tracked",
  "Your personal development growth plan, and a closing 1:1 call with Roweena",
  "Certificate of completion with 25 CPD hours",
];

export const AUDIENCES = [
  { title: "Individuals", body: "Anyone who keeps everyone else standing" },
  { title: "Teams", body: "Departments carrying sustained pressure" },
  { title: "Leaders", body: "Decision-makers running on empty" },
  { title: "Campuses", body: "Students meeting pressure for the first time" },
];

export const SPEAKER = {
  intro:
    "A personal resilience story told without gloss, the brain explained in language nobody has to pretend to follow, and an activity that turns a listening room into a participating one.",
  inPerson: {
    label: "In person · 2 hours",
    rows: [
      { name: "Speaker assignment", value: "60 min" },
      { name: "Activity", value: "30 min" },
      { name: "Q&A", value: "15–30 min" },
    ],
  },
  online: {
    label: "Online · 1 hour",
    body: [
      "The speaker assignment, delivered live to a distributed audience. Same story, same brain science, built for a screen and a chat window rather than a stage.",
      "Runs comfortably for large internal audiences across time zones.",
    ],
  },
  walkThrough: [
    "A personal resilience story",
    "Brain intro, in simple language",
    "Brain train vs brain drain",
    "Brain health vs mental health",
    "Building real confidence",
    "Thoughts leading to behaviours",
  ],
  fits: [
    {
      title: "Conferences & summits",
      body: "An opening that resets how the rest of the day talks about pressure.",
    },
    {
      title: "Corporate wellness days",
      body: "Substance instead of a fruit basket and a poster campaign.",
    },
    {
      title: "Colleges & campuses",
      body: "Vocabulary for pressure, before it becomes a pattern.",
    },
  ],
};

export const VISION_BOARD = {
  intro:
    "Most vision boards are decoration. This one is built the other way round. The neuroscience of why goals stick comes first, and the board is what the brain does with it afterwards.",
  inPerson: {
    label: "In person · 2–3 hours",
    rows: [
      { name: "Process & framework", value: "30 min" },
      { name: "Activity", value: "90 min" },
      { name: "Group size", value: "Up to 20 pax" },
    ],
    note: "Vision Board Kit provided. Requires floor or table space for the activity.",
  },
  online: {
    label: "Online · 1 hour",
    body: [
      "The full process and framework delivered live, with participants building their boards at home alongside the session.",
      "Vision Board Kits to be purchased in advance by the client so every participant starts with the same materials.",
    ],
  },
  pillars: [
    {
      title: "Neuroscience unlocked",
      body: "Why the brain treats a seen goal differently from a stated one.",
    },
    {
      title: "Goal setting",
      body: "Goals framed so they survive contact with an ordinary week.",
    },
    {
      title: "The kit",
      body: "Everything needed to build a board that leaves the room with them.",
    },
  ],
  checkIns: {
    title: "Quarterly or monthly check-ins",
    body: "A board does its work over months, not hours. Optional scheduled check-ins keep the goals live and the momentum honest. Available at additional cost for groups and individuals.",
  },
};

export const GLANCE = [
  {
    offering: "Resilience Speaker + Activity",
    inPerson: "2 hours",
    inPersonNote: "Speaker 60 min · Activity 30 min · Q&A 15–30 min",
    online: "1 hour",
    onlineNote: "Speaker assignment, delivered live",
  },
  {
    offering: "11 Steps to You Programme",
    inPerson: "12 classes · 2 hrs each",
    inPersonNote: "Certified · 25 CPD hours",
    online: "12 classes · 2 hrs each",
    onlineNote: "Certified · 25 CPD hours",
  },
  {
    offering: "Vision Board Workshop",
    inPerson: "2–3 hours",
    inPersonNote: "Up to 20 pax · Kit provided · Activity space required",
    online: "1 hour",
    onlineNote: "Kits purchased in advance by client",
  },
  {
    offering: "Corporate Workshop",
    inPerson: "1 day",
    inPersonNote: "Certificate of participation",
    online: "1 day",
    onlineNote: "Certificate of participation",
  },
];

export const PROCESS = [
  {
    title: "Discovery call",
    body: "A short conversation about the room, the pressure it carries and the outcome you need.",
  },
  {
    title: "Format & date",
    body: "Offering, duration and delivery mode confirmed against your calendar and time zone.",
  },
  {
    title: "Delivery",
    body: "On site or online, with kits and materials arranged ahead of the session.",
  },
  {
    title: "Follow through",
    body: "Certification, closing calls and optional check-ins that keep the work alive.",
  },
];

export const CREDENTIALS = [
  {
    group: "Professional",
    items: [
      "NLP Practitioner (KHDA Certified)",
      "Brain Academy Alumni, Belgium",
      "MSc Psychology / Neuroscience in Mental Health, King's College (pursuing)",
    ],
  },
  {
    group: "Corporate",
    items: [
      "Project Management Professional (PMP)",
      "CIPD Level 3 Certified",
      "Lean Six Sigma (Yellow Belt)",
      "Certified Scrum Master",
    ],
  },
  {
    group: "Leadership training",
    items: ["Speed of Trust", "7 Habits of Highly Effective People"],
  },
  {
    group: "Practising across",
    items: ["United Arab Emirates", "India"],
  },
];

export const ORGANISATIONS = [
  { name: "Standard Chartered", file: "standard-chartered" },
  { name: "Mimecast", file: "mimecast" },
  { name: "Live Love Laugh Foundation", file: "live-love-laugh" },
  { name: "Dubai Health Authority", file: "dubai-health-authority" },
  { name: "First Abu Dhabi Bank", file: "fab" },
  { name: "St Agnes College, Mangaluru", file: "st-agnes-college" },
  { name: "Sukoon", file: "sukoon" },
  { name: "Paramount", file: "paramount" },
  { name: "TIIB, The Innovation Institute of Business", file: "tiib" },
];

export const STAGES = [
  { name: "Transform Trauma Oxford", file: "transform-trauma-oxford" },
  { name: "Holistic Health Middle East 2025", file: "holistic-health-middle-east" },
  { name: "Bridge Summit", file: "bridge-summit" },
  { name: "WHX, World Health Expo", file: "whx" },
  { name: "Gladiator Summit", file: "gladiator-summit" },
  { name: "Global Justice, Love & Peace Summit", file: "global-justice-summit" },
  { name: "AccessAbilities Expo", file: "accessabilities-expo" },
  { name: "Forbes Healthcare Leaders Summit", file: "forbes-healthcare-leaders" },
];
