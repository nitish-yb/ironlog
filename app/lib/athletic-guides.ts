export type AthleticGuide = {
  exerciseName: string;
  image: string;
  frame: [column: number, row: number];
  grid: [columns: number, rows: number];
  steps: [string, string, string];
  watchQuery: string;
  sourceUrl: string;
  safety: string;
};

const sprintSource = "https://www.nsca.com/education/articles/kinetic-select/sprinting-mechanics-and-technique/";
const brakingSource = "https://www.nsca.com/education/articles/kinetic-select/acceleration-and-deceleration-mechanics/";
const plyometricSource = "https://www.acefitness.org/continuing-education/certified/july-2026/9161/world-cup-ready-soccer-training-that-builds-speed-strength-and-stamina/";
const strengthSource = "https://www.acefitness.org/resources/everyone/exercise-library/equipment/dumbbells/";

export const athleticGuides: Record<string, AthleticGuide> = Object.fromEntries(([
  {
    exerciseName: "Wall acceleration march", image: "/athletic/athletic-sprints.webp", frame: [0, 0], grid: [2, 3], sourceUrl: sprintSource,
    steps: ["Lean into a wall with a straight line from head through the planted heel.", "Drive one knee to hip height, toes pulled toward your shin, without arching your back.", "Switch legs under control while keeping hips tall and pressure through the wall."],
    safety: "If your hips drop or lower back arches, reset the lean and slow down.", watchQuery: "wall acceleration march sprint drill tutorial",
  },
  {
    exerciseName: "Wall switch", image: "/athletic/athletic-sprints.webp", frame: [1, 0], grid: [2, 3], sourceUrl: sprintSource,
    steps: ["Set the same straight, forward-leaning wall position and hold one knee up.", "Punch the raised foot down while the opposite knee switches up quickly.", "Freeze each landing briefly: hips level, heel lifted and ankle stiff."],
    safety: "Speed comes after clean positions—do not bounce through a rounded lower back.", watchQuery: "wall switch sprint mechanics drill tutorial",
  },
  {
    exerciseName: "A-march", image: "/athletic/athletic-sprints.webp", frame: [0, 1], grid: [2, 3], sourceUrl: sprintSource,
    steps: ["Stand tall with ribs stacked over hips and swing the opposite arm naturally.", "Lift the knee to about hip height while pulling the toes up.", "Step down beneath your hip, then repeat with a crisp marching rhythm."],
    safety: "Do not reach the foot forward or lean backward to lift the knee higher.", watchQuery: "A march sprint drill proper form tutorial",
  },
  {
    exerciseName: "Fifteen-metre acceleration", image: "/athletic/athletic-sprints.webp", frame: [1, 1], grid: [2, 3], sourceUrl: brakingSource,
    steps: ["Begin in a relaxed split stance with your body angled forward.", "Push the ground backward with short, powerful first steps and active arms.", "Rise gradually as each stride lengthens; run through the 15-metre mark."],
    safety: "Stay at the planned 70–90% effort and stop if the surface is wet or slippery.", watchQuery: "15 metre acceleration sprint drill proper form",
  },
  {
    exerciseName: "Accelerate and stop", image: "/athletic/athletic-sprints.webp", frame: [0, 2], grid: [2, 3], sourceUrl: brakingSource,
    steps: ["Accelerate smoothly, leaving enough space before the stopping line.", "Begin braking early with progressively shorter, slightly wider steps.", "Lower your hips by bending ankles, knees and hips, then finish balanced."],
    safety: "Never try to stop in one rigid step; spread the braking force across several contacts.", watchQuery: "sprint acceleration deceleration stop drill tutorial",
  },
  {
    exerciseName: "Outdoor dynamic warm-up", image: "/athletic/athletic-sprints.webp", frame: [1, 2], grid: [2, 3], sourceUrl: sprintSource,
    steps: ["Jog easily for three minutes, then perform ankle rocks and leg swings.", "Use smooth walking lunges with your front foot fully planted.", "Finish with two controlled 10-metre lateral shuffles in each direction."],
    safety: "Use a dry, nonslip surface and keep every warm-up movement submaximal.", watchQuery: "dynamic warm up sprint ankle rocks leg swings lateral shuffle",
  },
  {
    exerciseName: "Snap-down", image: "/athletic/athletic-jumps.webp", frame: [0, 0], grid: [3, 2], sourceUrl: plyometricSource,
    steps: ["Stand tall with arms overhead and feet about hip-width apart.", "Sweep the arms down and quickly drop into a shallow athletic squat.", "Stick the position: hips back, chest controlled and knees tracking over toes."],
    safety: "Land quietly and hold for two seconds; stop if either knee caves inward.", watchQuery: "snap down landing drill plyometric tutorial",
  },
  {
    exerciseName: "Pogo jumps", image: "/athletic/athletic-jumps.webp", frame: [1, 0], grid: [3, 2], sourceUrl: plyometricSource,
    steps: ["Stand tall with a braced trunk and only a small bend in the knees.", "Bounce from the ankles, keeping contacts quick and jumps low.", "Land under your centre of mass and move straight into the next repetition."],
    safety: "Think quiet and springy; stop if contacts become heavy or your heels collapse inward.", watchQuery: "pogo jumps proper form ankle plyometric tutorial",
  },
  {
    exerciseName: "Broad jump and stick", image: "/athletic/athletic-jumps.webp", frame: [2, 0], grid: [3, 2], sourceUrl: plyometricSource,
    steps: ["Load by hinging at the hips and swinging both arms behind you.", "Drive forward explosively with full hip, knee and ankle extension.", "Land on both feet with hips back and hold the landing for two seconds."],
    safety: "End the set as soon as distance, balance or landing quality declines.", watchQuery: "standing broad jump and stick landing tutorial",
  },
  {
    exerciseName: "Lateral bound and stick", image: "/athletic/athletic-jumps.webp", frame: [0, 1], grid: [3, 2], sourceUrl: plyometricSource,
    steps: ["Balance on one leg with the hip and knee softly bent.", "Push sideways and travel to the opposite leg using your arms for balance.", "Land with the hip back, knee aligned over toes and hold before returning."],
    safety: "Start with a small distance; do not let the landing knee collapse inward.", watchQuery: "lateral bound and stick proper form tutorial",
  },
  {
    exerciseName: "Dumbbell push press", image: "/athletic/athletic-jumps.webp", frame: [1, 1], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Hold the dumbbells at shoulder height with feet planted and torso braced.", "Dip straight down a few centimetres, then drive hard through the legs.", "Transfer the momentum overhead and finish with arms locked out over your body."],
    safety: "Keep the dip vertical and avoid leaning back or turning it into a slow grind.", watchQuery: "dumbbell push press proper form short tutorial",
  },
  {
    exerciseName: "Explosive incline push-up", image: "/athletic/athletic-jumps.webp", frame: [2, 1], grid: [3, 2], sourceUrl: plyometricSource,
    steps: ["Place hands on a stable bench and hold a straight plank from head to heels.", "Lower your chest under control with elbows angled slightly back.", "Push explosively so the hands leave the bench, then catch softly and reset."],
    safety: "Use a bench that cannot slide and reduce explosiveness before your plank position breaks.", watchQuery: "explosive incline push up plyometric tutorial",
  },
  {
    exerciseName: "Bulgarian split squat", image: "/athletic/athletic-strength.webp", frame: [0, 0], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Set the rear foot on a bench and move the front foot far enough to stay balanced.", "Lower for three seconds with your full front foot planted and torso controlled.", "Drive through the front foot to stand without pushing off the rear leg."],
    safety: "Keep the front knee tracking with the toes; shorten the depth if the hip or knee pinches.", watchQuery: "Bulgarian split squat dumbbell proper form tutorial",
  },
  {
    exerciseName: "Supported single-leg dumbbell RDL", image: "/athletic/athletic-strength.webp", frame: [1, 0], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Hold a rack lightly with one hand and keep a soft bend in the standing knee.", "Push the hips backward as the free leg reaches behind you; keep hips square.", "Stop before the back rounds, then squeeze the standing-side glute to return."],
    safety: "The movement is a hip hinge, not a reach toward the floor; keep your spine neutral.", watchQuery: "supported single leg dumbbell RDL proper form",
  },
  {
    exerciseName: "Optional hamstring walkout", image: "/athletic/athletic-strength.webp", frame: [2, 0], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Begin in a glute bridge with heels close to your hips and toes lifted.", "Take small heel steps away while keeping the hips as high as you can control.", "Pause before the hips drop, then walk the heels back and reset."],
    safety: "Use a short range first; stop for hamstring cramping or lower-back discomfort.", watchQuery: "hamstring walkout bridge proper form tutorial",
  },
  {
    exerciseName: "Single-leg calf raise holding dumbbell", image: "/athletic/athletic-strength.webp", frame: [0, 1], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Hold a stable support lightly and balance on the ball of one foot.", "Lower the heel under control, then rise as high as possible without rolling the ankle.", "Pause at the top and lower slowly before the next repetition."],
    safety: "Keep pressure through the big toe and avoid bouncing through the bottom.", watchQuery: "single leg dumbbell calf raise proper form tutorial",
  },
  {
    exerciseName: "Farmer carry", image: "/athletic/athletic-strength.webp", frame: [1, 1], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Stand tall between two dumbbells, brace, and pick them up with a controlled hinge.", "Walk with short natural steps, ribs stacked and shoulders down away from ears.", "Turn carefully, finish the distance, then hinge to place the weights down."],
    safety: "Choose a load that does not make you sway, rush or lose your neutral posture.", watchQuery: "farmer carry dumbbell proper form tutorial",
  },
  {
    exerciseName: "Suitcase carry", image: "/athletic/athletic-strength.webp", frame: [2, 1], grid: [3, 2], sourceUrl: strengthSource,
    steps: ["Hold one dumbbell at your side and square your shoulders and hips.", "Brace as if resisting a side bend, then walk with steady, even steps.", "Keep the weight close, complete the distance and repeat on the other side."],
    safety: "Stay upright—reduce the weight if your torso leans toward or away from the dumbbell.", watchQuery: "suitcase carry dumbbell proper form tutorial",
  },
] satisfies AthleticGuide[]).map((guide) => [guide.exerciseName.toLowerCase(), guide]));

export const athleticGuideFor = (exerciseName: string) => athleticGuides[exerciseName.toLowerCase()];

export const athleticDemoUrl = (guide: AthleticGuide) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${guide.watchQuery} short`)}`;
