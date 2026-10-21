/** All site copy, taken from whatboutme.com. */

export const CONTACT = {
  website: "www.whatboutme.com",
  websiteHref: "https://www.whatboutme.com",
  email: "share@whatboutme.com",
  phones: [] as { number: string; place: string; href: string }[],
  social: "@whatboutme11",
};

/** Home page story, in Roweena's words, from whatboutme.com. */
export const LIVED_IT = {
  quote:
    "The moment I fell in love with my condition and my BRAIN, I chased it to become its best version; only to realize, it changed everything for the BETTER!",
  heading: "I have been where you are!",
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
  { label: "Events", href: "/events" },
  { label: "Gallery", href: "/gallery" },
  { label: "About Me", href: "/about" },
  { label: "Certification", href: "#certification" },
  { label: "FAQ", href: "#faq" },
];

/** Extra blocks shown on a course's own page. */
type CourseExtras = {
  sections?: { title: string; text: string }[];
  gallery?: { src: string; alt: string }[];
  links?: { label: string; href: string }[];
};

// Text and images come from whatboutme.com, one entry per program page.
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
    title: "11 Steps to U Program",
    duration: "12 classes",
    meta: "25 CPD Hours (UK)",
    image: "/site/course-photo.webp",
    alt: "A coach leading a small-group workshop discussion at a flip chart",
    flagship: true,
    body: "Get Certified for working on yourself and earn 25 CPD Hours (UK). You will leave this program feeling liberated from your old thoughts, with a rewired brain for action, embracing the self you are meant to be.",
    inPerson: "",
    online: "",
    points: [],
    sections: [
      {
        title: "The Approach",
        text: "I believe that every individual has the potential to live a fulfilling and purposeful life. My approach is centered around helping my clients cultivate self-awareness through coaching, identify their values and goals, and create actionable steps towards achieving goals. By integrating brain health education and personal growth tools into my practice, I am committed to providing a safe and non-judgmental space for my clients to explore their inner world and work towards their desired outcomes.",
      },
      {
        title: "Why whatboutme?",
        text: "I too was once caught in a web of family, career, medications, and mental disorders, living a narrative that wasn't truly mine. Through years of personal growth tools, resilience, and recovery, I now embrace a medication-free life, living my dream that is uniquely my own. I have lived this journey, and now I coach others in their own paths. YOU CAN CHANGE YOUR LIFE with the carefully curated resources, brain health education, and self-awareness coaching provided.",
      },
      {
        title: "The Outcome",
        text: "You will leave this program feeling liberated from your old thoughts, with a rewired brain for action, embracing the self you are meant to be. This journey will also enhance your brain health education, equipping you with essential personal growth tools and self-awareness coaching to guide your transformation life. Upon achieving 80% passing marks on the exam and submitting your personal development growth plan, you will be awarded a CERTIFICATION OF COMPLETION, 25 HOURS OF CONTINUING PROFESSIONAL DEVELOPMENT (CPD) marking the start of the life you have always dreamed of.",
      },
      {
        title: "Program Details",
        text: "Starts 26th September 2026 on Saturdays · 11am INDIA : 9:30am UAE · 2 hours per class · 12 classes",
      },
    ],
    gallery: [
      { src: "/site/steps-agenda.png", alt: "11 Steps to U Program agenda" },
      { src: "/site/steps-flyer.png", alt: "11 Steps to YOU Program flyer" },
      { src: "/site/steps-banner.png", alt: "11 Steps to U Program" },
    ],
    links: [{ label: "Register to Learn More", href: "https://forms.gle/3uRSzfUoFuSjuL8w8" }],
  },
  {
    slug: "resilience-speaker",
    title: "Resilience Speaker",
    duration: "Corporate Sessions",
    meta: "Speaker Assignments on Brain Health",
    image: "/site/course-photo.webp",
    alt: "A coach leading a small-group workshop discussion at a flip chart",
    flagship: false,
    body: "Why only TOP 1%? Everyone deserves a BRAIN that performs! Building Focused, Resilient & High-Performing Teams because the BRAINS of your people is your biggest assets.",
    inPerson: "",
    online: "",
    points: [],
    sections: [
      {
        title: "Corporate Sessions",
        text: "Why only TOP 1%? Everyone deserves a BRAIN that performs! Building Focused, Resilient & High-Performing Teams because the BRAINS of your people is your biggest assets. We spend the biggest part of our day in our workplace, this is where we thrive, excel, struggle and burn out. Having the right tools and knowledge about our brains will increase the speed of success and minimize failures.",
      },
      {
        title: "For Everyone",
        text: "Brain health isn't just for executives or athletes; it's vital for parents, students, professionals, caregivers, creatives, and anyone navigating modern life. Our workshops are designed to help everyday people understand their brain, manage stress, and regulate emotions, providing anxiety and depression support without jargon, pressure, or perfection.",
      },
      {
        title: "I Lived It, So I Coach It.",
        text: "Prevention better than Burnout? A simple talk, with an intention to help understand and NOT FIX. An understanding to promote growth and NOT JUDGE. From one human to the other, from one experience of failure to resilience.",
      },
    ],
    gallery: [
      { src: "/site/speaker-flyer.png", alt: "Corporate wellness talks on brain health by Roweena Britto" },
    ],
    links: [{ label: "Book Now", href: "mailto:share@whatboutme.com?subject=Corporate%20Session" }],
  },
  {
    slug: "vision-board-workshop",
    title: "Vision Board",
    duration: "Kit & Workshop",
    meta: "Neuroscience & lived experience",
    image: "/site/course-photo.webp",
    alt: "A coach leading a small-group workshop discussion at a flip chart",
    flagship: false,
    body: "Vision Board Kit developed with neuroscience and lived experience. THOUGHT. NOTE. DESIGN. ACTION. BEHAVIOUR.",
    inPerson: "",
    online: "",
    points: [],
    sections: [
      {
        title: "Vision Board Kits",
        text: "I have designed the Vision Board Kit through neuroscience, frameworks & lived experience. All you need is your dreams, goals, and the will to make a difference in your life through mental wellness! Buy the Vision Board Kit and visualize your success and enhance your brain health!",
      },
      {
        title: "Vision Board Workshop",
        text: "Let's make it simple! THOUGHT. NOTE. DESIGN. ACTION. BEHAVIOUR. When your brain doesn't know where it needs to go, confusion creeps in, leading to overthinking, a lack of worth, and definitely boredom! This is where group training and personal sessions come into play, enhancing your brain health and promoting mental wellness. Vision board workshops help your brain to remain focused and actively hunt for ways to achieve your goals. Whether you are group / corporate or just a community that wants to grow - Let's build our dreams through a clear vision.",
      },
    ],
    gallery: [
      { src: "/site/vision-1.jpg", alt: "Vision Board Kit contents" },
      { src: "/site/vision-2.jpg", alt: "Vision Board Kit contents" },
      { src: "/site/vision-3.jpg", alt: "Vision Board Kit contents" },
      { src: "/site/vision-4.jpg", alt: "Vision Board Kit contents" },
    ],
    links: [
      { label: "India - Click for Amazon.in", href: "https://www.amazon.in/dp/B0HKNDHVL3" },
      { label: "Dubai - Click for IQ Fulfillment", href: "https://buy.stripe.com/aFa9AS0t1cnF7xfddk8ww0q" },
      {
        label: "Send Me an Email",
        href: "mailto:share@whatboutme.com?subject=VB%20Workshop%20-%20Corporate%2FGroups&body=Hello%2C%0A%0AI%20am%20interested%20in%20the%20Vision%20Board%20Workshop",
      },
    ],
  },
];

export const COURSE_FACTS = [
  "25 CPD hours (UK)",
  "Twelve live online classes",
  "Starts 26 September 2026",
];

export const FAQS = [
  {
    q: "How long is the 11 Steps to U Program?",
    a: "12 classes, 2 hours per class, on Saturdays at 11am INDIA : 9:30am UAE. It starts 26th September 2026.",
  },
  {
    q: "How do I earn the certificate?",
    a: "Upon achieving 80% passing marks on the exam and submitting your personal development growth plan, you will be awarded a CERTIFICATION OF COMPLETION, 25 HOURS OF CONTINUING PROFESSIONAL DEVELOPMENT (CPD).",
  },
  {
    q: "Who is brain health for?",
    a: "Brain health isn't just for executives or athletes; it's vital for parents, students, professionals, caregivers, creatives, and anyone navigating modern life.",
  },
  {
    q: "Where can I buy the Vision Board Kit?",
    a: "India on Amazon.in, and Dubai through IQ Fulfillment.",
  },
];

export const OFFERINGS = [
  {
    tag: "CPD Accredited · Flagship",
    title: "11 Steps to You",
    headline: "Twelve weeks to rebuild how you treat your own head.",
    body: "The full curriculum. Twelve live classes, weekly practice, neuroscience made usable, an exam and an internationally recognized CPD credential.",
    detail: "12 classes · 25 CPD hours · Certificate",
    href: "/courses/11-steps-to-you",
  },
  {
    tag: "Speaking",
    title: "Resilience Keynote",
    headline: "An honest, unflinching hour on burnout, resilience and the brain.",
    body: "Roweena Britto speaks to organisations about what high pressure actually does to the nervous system, drawing on eighteen corporate years and her own recovery.",
    detail: "60–90 min · In person or online · Keynote + Q&A",
    href: "/courses/resilience-speaker",
  },
  {
    tag: "Workshop",
    title: "Vision Board",
    headline: "Turn abstract intentions into physical, daily direction.",
    body: "A structured, hands-on session using the whatboutme Vision Board Kit. Participants leave with a finished board and the neuroscience of why it works.",
    detail: "Half day · Materials provided · Up to 20 pax",
    href: "/courses/vision-board-workshop",
  },
];

export const STATS = [
  { value: "25", label: "CPD Hours (UK)" },
  { value: "12", label: "Classes" },
  { value: "02", label: "Hours per class" },
  { value: "11", label: "Steps to U" },
];

export const STEP_LABELS: Record<number, string> = {
  1: "Truth",
  3: "Baseline",
  5: "Daily Life",
  7: "Brain Health",
  11: "Renewed You",
};

export const PROGRAMME_FACTS = [
  { label: "Format", value: "12 classes", body: "2 hours per class, on Saturdays" },
  { label: "Starts", value: "26 Sep 2026", body: "11am INDIA : 9:30am UAE" },
  { label: "Accreditation", value: "25 CPD Hours", body: "Certification of Completion (UK)" },
];

export const LEAVE_WITH = [
  "A personal development growth plan you built yourself",
  "A rewired understanding of your own triggers and values",
  "Tools for emotional regulation you can use on a difficult day",
  "25 CPD hours (UK) and a certificate you worked for",
];

export const GROUND_COVERED = [
  "The TRUTH about who you actually are right now",
  "Your BASELINE: honest accounting of where energy goes",
  "DAILY LIFE: habits, boundaries and the people around you",
  "The BRAIN: neuroplasticity, burnout and rewiring in practice",
];

export const HOW_EXAM_WORKS = [
  "11 module quizzes to check understanding as you go",
  "A final exam covering the full curriculum",
  "80% passing mark required for the CPD credential",
  "One retake included; guidance provided if you fall short",
];

export const CERTIFICATION = [
  "12 classes, 2 hours per class, on Saturdays",
  "Achieve 80% passing marks on the exam",
  "Submit your personal development growth plan",
  "Be awarded a CERTIFICATION OF COMPLETION",
  "Earn 25 HOURS OF CONTINUING PROFESSIONAL DEVELOPMENT (CPD)",
  "Mark the start of the life you have always dreamed of",
];

export const AUDIENCES = [
  {
    title: "Corporate Leaders",
    body: "Who carry teams, hit numbers, and have forgotten what their own baseline feels like.",
  },
  {
    title: "Caregivers & Parents",
    body: "Holding the emotional weight of a household while quietly running on empty.",
  },
  {
    title: "High Performers",
    body: "Who want the science of why their brain stalls under stress and what to do about it.",
  },
  {
    title: "Anyone at a Crossroad",
    body: "Recovering from burnout, illness or a major shift, ready to rebuild intentionally.",
  },
];

export const GLANCE = [
  {
    offering: "Resilience Speaker",
    inPerson: "Corporate Sessions",
    inPersonNote: "Speaker Assignments on Brain Health",
    online: "Corporate Sessions",
    onlineNote: "Speaker Assignments on Brain Health",
  },
  {
    offering: "11 Steps to U Program",
    inPerson: "12 classes · 2 hrs each",
    inPersonNote: "Certified · 25 CPD Hours",
    online: "12 classes · 2 hrs each",
    onlineNote: "Certified · 25 CPD Hours",
  },
  {
    offering: "Vision Board",
    inPerson: "Kit & Workshop",
    inPersonNote: "Neuroscience & lived experience",
    online: "Kit & Workshop",
    onlineNote: "Neuroscience & lived experience",
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

