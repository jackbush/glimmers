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
      description: "Spend a night star-gazing in the High Atlas. Choose constellation maps from a selection of regional sky cultures.",
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
      name: "Metty",
      description: "Interface prototype for a robotic meditation timer, styled like a record player. Hardware build in progress.",
      url: "https://jackbush.github.io/metty/",
      cover: { format: "square", image: new URL('./covers/metty.jpg', import.meta.url).href },
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
        dates: "2024 – 2026",
        description:
            "Owned product, design, research and product marketing for a supply-chain traceability and Digital Product Passport platform. Took it from a fragmented, support-operated legacy suite to one self-serve platform. Restructured product and engineering into cross-functional teams.",
        listItems: [
            "Moved customers off support and onto the product: System Usability Scale score from 14 to 79 with WCAG AA accessibility.",
            "Packaged the platform into off-the-shelf propositions, setting sales up for repeatable deals instead of bespoke pilots.",
            "Rebuilt the platform API-first on AWS and open source, with a data lake and full API parity, cutting running costs 25%.",
            "Cut supply chain configuration time 70%, and shipped an AI assistant to automate customer API onboarding.",
        ],
    },
    {
        organisation: "OVO Energy",
        role: "Principal Product Designer",
        dates: "2020 – 2024",
        description:
            "Led design of OVO’s consumer app and digital experience for 4m UK households, also owning the design system and accessibility.",
        listItems: [
            "Rebuilt the customer app from information architecture up, based on mental model research, growing users from 200k to 500k and doubling engagement.",
            "Brought every customer product onto one design system at WCAG AA, with open clinics and team-wide training.",
        ],
    },
    {
        organisation: "Kantan",
        role: "Head of Design",
        dates: "2019 – 2020",
        description:
            "First hire at an OVO-backed start-up building tools for independent tradespeople. Built and led a design team covering research, service design, product design and brand.",
        listItems: [
            "Scaled from four local pilot users to 1000+ engineers covering the whole UK.",
            "Conceived an automated booking service from ethnographic research, converted 82% from email to booking.",
            "Organised ride-alongs, with every employee spending a day in the field with users.",
        ],
    },
    {
        organisation: "Rocket Lawyer",
        role: "Product Innovation Consultant",
        dates: "2018 – 2019",
        description:
            "Led research and development into how emerging technologies (electronic signatures, blockchain, smart contracts and payments) could make legal protection more accessible.",
        listItems: [
            "Designed Rocket Wallet, a payment protection service that released funds based on contract terms, taking it to private beta with partners.",
        ],
    },
    {
        organisation: "Everledger",
        role: "Head of Product",
        dates: "2016 – 2018",
        description:
            "Set up the product and design function at an accelerator-stage start-up, leading it through growth to a $10.4m Series A.",
        listItems: [
            "Built the first decentralised platform for tracing provenance data across supply chains, securing over two million diamonds.",
            "Used it to digitally track the first diamond from mine to market across mining, cutting, polishing and certification.",
        ],
    },
    {
        organisation: "Make Us Proud",
        role: "Product Designer + Engineer",
        dates: "2015 – 2016",
        description:
            "Full-spectrum product consultancy covering research, propositions, prototyping, user testing and engineering. Projects included B2B platforms, marketing websites and experiences (VR, game, exhibition).",
        listItems: [
            "Won: Best Exhibition Design at London Design Week (2015).",
        ],
    },
    {
        organisation: "Victoria University",
        role: "Research Assistant",
        dates: "2012 – 2013",
        description:
            "Found and documented Vishnu shrines in the Kathmandu valley, narrating local myths about the origins of the cosmos, and integrated into a series of drawings.",
    },
    {
        organisation: "Ponoko",
        role: "Production Manager",
        dates: "2010 – 2013",
        description:
            "On-demand prototyping and manufacturing for NZ and Australia.",
        listItems: [
            "Reduced order turnaround from 10 days to 48 hours.",
            "Cut material costs by 25%.",
        ],
    },
];
