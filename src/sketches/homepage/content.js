// Homepage — the page's content, copied from jackbush.github.io (src/data/) to try the
// backdrop under the real thing. The site's own copy is the source of truth.

// Cover URLs are spelled out because Vite only bundles literal paths: the sketch's own
// (downscaled) copies in covers/, or a glimmer's cover from its folder.

/**
 * As the site's: a card links to `url` with a `cover` (`landscape`: a 3:2 header, optionally a
 * looping `video` over the image, or a `background` behind a transparent one; `square`: beside
 * the text), or plays a Vimeo video in place. Any card can add a `link`, a bar along its bottom.
 * @type {{ name: string, description: string, url?: string, vimeo?: string,
 *   cover?: { format: 'landscape' | 'square', image: string, video?: string, background?: string },
 *   link?: { label: string, url: string } }[]}
 */
export const projects = [
  {
      name: "Sprig",
      description: "Botanical studies. Be taken on an arboreal tour, or click the settings cog and invent your own impossible plants.",
      url: "https://jackbush.github.io/glimmers/sprig/",
      cover: { format: "landscape", image: new URL('../sprig/cover.jpg', import.meta.url).href, video: new URL('../sprig/cover.mp4', import.meta.url).href },
  },
  {
      name: "Zola",
      description: "Build more accessible products. Each card describes a real person's experience and needs, which your design should accommodate.",
      url: "https://jackbush.github.io/zola/",
      cover: { format: "landscape", image: new URL('./covers/zola.png', import.meta.url).href, background: "#BC6061" },
  },
  {
      name: "Risolino",
      description: "Make risograph prints from anywhere. Customise the ink blending, shading model and registration jitter for some analogue charm.",
      url: "https://jackbush.github.io/risolino/",
      cover: { format: "landscape", image: new URL('./covers/risolino.jpg', import.meta.url).href },
  },
  {
      name: "Atlas Nights",
      description: "Spend a night star-gazing in the High Atlas. Choose constellation maps from any of the historic sky cultures of the region.",
      url: "https://jackbush.github.io/glimmers/atlas-nights/",
      cover: { format: "landscape", image: new URL('../atlas-nights/cover.jpg', import.meta.url).href, video: new URL('../atlas-nights/cover.mp4', import.meta.url).href },
  },
  {
      name: "Chromist",
      description:
          "Get your colours right. Build palettes for modern devices, see how they appear on old screens, audit accessibility against the next standards.",
      url: "https://jackbush.github.io/chromist/",
      cover: { format: "square", image: new URL('./covers/chromist.jpg', import.meta.url).href },
  },
  {
      name: "Blackstar",
      description: "An undulating black orb with a burning halo. Open the settings pane to design your own void.",
      url: "https://jackbush.github.io/glimmers/blackstar/",
      cover: { format: "landscape", image: new URL('../blackstar/cover.jpg', import.meta.url).href, video: new URL('../blackstar/cover.mp4', import.meta.url).href },
  },
  {
      name: "Albums",
      description:
          "Nice, old-fashioned photo albums. Because social media is a dumpster fire, but it's nice to show your mum what you've been up to.",
      url: "https://jackbush.github.io/albums/",
      cover: { format: "landscape", image: new URL('./covers/albums-norway.jpg', import.meta.url).href },
  },
  {
      name: "Carver",
      description: "Write in convenient markdown, export as beautiful PDF. Minimal by design, private by default, delightful by nature.",
      url: "https://jackbush.github.io/carver/",
      cover: { format: "landscape", image: new URL('./covers/carver.jpg', import.meta.url).href },
  },
  {
      name: "Zen and the Art of Bikepacking Maintenance",
      description: "Photos for an essay about gumption, romantic thinking, quality, and bikepacking across Europe.",
      url: "https://theradavist.com/zen-and-bikepacking",
      cover: { format: "landscape", image: new URL('./covers/zen-tentlife.jpg', import.meta.url).href },
  },
  {
      name: "Mindflow",
      description:
          "Animated graphics that respond to your brain waves: focus to overlap the rings, relax to calm the outlines.",
      vimeo: "1215878977",
      link: { label: "Play with the animation settings", url: "https://jackbush.github.io/glimmers/mindflow/" },
  },
  {
      name: "Metty",
      description: "Interface prototype for a robotic meditation timer, styled like a record player. Hardware build in progress.",
      url: "https://jackbush.github.io/metty/",
      cover: { format: "square", image: new URL('./covers/metty.jpg', import.meta.url).href },
  },
  {
      name: "Seeing Britain",
      description:
          "Learning my adoptive home by visiting every county. Mostly done by bicycle, tracked on an interactive map.",
      url: "https://jackbush.github.io/seeing-britain/",
      cover: { format: "square", image: new URL('./covers/seeing-britain.jpg', import.meta.url).href },
  },
  {
      name: "Quadra",
      description: "Make QR codes without having your data scraped. Highly customisable, ISO-compliant and ad-free.",
      url: "https://jackbush.github.io/quadra/",
      cover: { format: "square", image: new URL('./covers/quadra.jpg', import.meta.url).href },
  },
];

export const roles = [
    {
        organisation: "Circulor",
        role: "VP Product",
        dates: "Jan 2024 – Jun 2026",
        description:
          "Owned product, design, research and product marketing for an enterprise supply-chain traceability and Digital Product Passport platform. Took it from a fragmented, support-operated legacy suite to a single self-serve platform.",
        listItems: [
          "Moved customers off support and onto the product: System Usability Scale score from 15 to 80, AA accessibility score.",
          "Rebuilt with a modern front-end, customer API and data lake, swapping Oracle for AWS and open source: faster to build, easier to hire, 25% cheaper to run.",
          "Cut supply chain configuration time 70% with one-time setup, and shipped an AI assistant for API onboarding so engineers stopped working as consultants.",
          "Made privacy the differentiator: selective disclosure permissions let suppliers prove provenance without exposing commercially sensitive data.",
          "Restructured product and engineering into cross-functional teams with embedded design, clear ownership and a prioritisation model tied to strategy.",
          // "Built a product marketing function and packaged two off-the-shelf propositions, shifting sales from bespoke pilots to repeatable product deals.",
        ],
  },
    {
        organisation: "OVO",
        role: "Principal Product Designer",
        dates: "Oct 2020 – Jan 2024",
        description:
          "Led company-wide initiatives including design system, consumer app strategy, accessibility strategy and training, and research and design events for a 40-person design team.",
        listItems: [
          "Doubled app engagement",
          "AA accessibility across all customer products",
          "Every customer product on one design system",
          "Energy usage tool reduced customer bills",
        ],
    },
    // {
    //     organisation: "OVO",
    //     role: "Product Lead",
    //     dates: "Oct 2020 – Jan 2022",
    //     description:
    //       "Led product and design for six autonymous teams owning operational tooling. Built frameworks used across the rest of OVO.",
    // },
    {
        organisation: "Kantan",
        role: "Head of Design",
        dates: "Jun 2019 – Oct 2020",
        description:
          "Built and led a multidisciplinary design team responsible for ethnographic research, product strategy, service design, product design, user testing and brand.",
    },
    {
        organisation: "Rocket Lawyer",
        role: "Product Innovation Consultant",
        dates: "Jul 2018 – Jun 2019",
        description:
          "Started an innovation team to research, design and prototype whether emerging technology could make legal help reach people who normally can't afford it.",
      listItems: [
          "Built an escrow payment service, connected to the language in the contract.",
        ],
  },
    {
        organisation: "Everledger",
        role: "Head of Product",
        dates: "Oct 2016 – Jul 2018",
        description:
          "Set up the product and design function from scratch. Took a waterfall team spread thin across 20+ parallel projects and turned it into one agile team shipping a market-leading platform for provenance tracking, so you can actually trust where a thing came from.",
    },
    {
        organisation: "Make Us Proud",
        role: "Product Designer + Engineer",
        dates: "Apr 2015 – Aug 2016",
        description:
          "End-to-end agency work covering research, propositions, prototyping, user testing and delivery of platforms, websites, an art installation and a product playbook.",
        listItems: [
          "Won Best Exhibition Design at London Design Week (2016)",
        ],
},
    {
        organisation: "Ponoko",
        role: "Production Manager",
        dates: "Sep 2010 – Apr 2013",
        description:
          "On-demand prototyping and manufacturing for NZ and Australia.",
        listItems: [
          "Reduced order turnaround from 10 days to 48 hours",
          "Cut material costs by 25%",
        ],
    },
    {
        organisation: "Victoria University",
        role: "Research Assistant",
        dates: "Nov 2012 – Jan 2013",
        description:
          "Found and documented Vishnu shrines in the Kathmandu valley, narrating local myths about the origins of the cosmos, and integrated into a series of drawings."
    },
];
