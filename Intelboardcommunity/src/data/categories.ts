export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  parentId: string | null;
  level: number;
  wikiTitle: string;
  children: Category[];
}

// Top-level Wikipedia categories with 2 levels of subcategories
export const categories: Category[] = [
  {
    id: 'culture-arts',
    name: 'Culture and the Arts',
    slug: 'culture-and-the-arts',
    icon: '🎨',
    description: 'Visual arts, performing arts, literature, music, film, architecture, cuisine, fashion, and cultural traditions worldwide.',
    parentId: null,
    level: 0,
    wikiTitle: 'Culture',
    children: [
      {
        id: 'visual-arts', name: 'Visual Arts', slug: 'visual-arts', icon: '🖼️',
        description: 'Painting, sculpture, photography, printmaking, and other visual art forms.',
        parentId: 'culture-arts', level: 1, wikiTitle: 'Visual_arts',
        children: [
          { id: 'painting', name: 'Painting', slug: 'painting', icon: '🎨', description: 'The practice of applying paint to a surface for artistic expression.', parentId: 'visual-arts', level: 2, wikiTitle: 'Painting', children: [] },
          { id: 'sculpture', name: 'Sculpture', slug: 'sculpture', icon: '🗿', description: 'Three-dimensional art created by shaping materials.', parentId: 'visual-arts', level: 2, wikiTitle: 'Sculpture', children: [] },
          { id: 'photography', name: 'Photography', slug: 'photography', icon: '📷', description: 'The art and practice of creating images by recording light.', parentId: 'visual-arts', level: 2, wikiTitle: 'Photography', children: [] },
        ]
      },
      {
        id: 'performing-arts', name: 'Performing Arts', slug: 'performing-arts', icon: '🎭',
        description: 'Theatre, dance, music performance, opera, and other live art forms.',
        parentId: 'culture-arts', level: 1, wikiTitle: 'Performing_arts',
        children: [
          { id: 'theatre', name: 'Theatre', slug: 'theatre', icon: '🎭', description: 'Collaborative form of performing art using live performers.', parentId: 'performing-arts', level: 2, wikiTitle: 'Theatre', children: [] },
          { id: 'dance', name: 'Dance', slug: 'dance', icon: '💃', description: 'Art form of movement of the body, usually rhythmic and to music.', parentId: 'performing-arts', level: 2, wikiTitle: 'Dance', children: [] },
          { id: 'opera', name: 'Opera', slug: 'opera', icon: '🎤', description: 'Art form combining music, drama, and visual arts.', parentId: 'performing-arts', level: 2, wikiTitle: 'Opera', children: [] },
        ]
      },
      {
        id: 'literature', name: 'Literature', slug: 'literature', icon: '📚',
        description: 'Written works considered to have artistic merit, including novels, poetry, and drama.',
        parentId: 'culture-arts', level: 1, wikiTitle: 'Literature',
        children: [
          { id: 'poetry', name: 'Poetry', slug: 'poetry', icon: '📝', description: 'Literary art form that uses aesthetic qualities of language.', parentId: 'literature', level: 2, wikiTitle: 'Poetry', children: [] },
          { id: 'fiction', name: 'Fiction', slug: 'fiction', icon: '📖', description: 'Literature created from the imagination, not based strictly on facts.', parentId: 'literature', level: 2, wikiTitle: 'Fiction', children: [] },
          { id: 'non-fiction', name: 'Non-fiction', slug: 'non-fiction', icon: '📰', description: 'Prose writing that is based on facts, real events, and real people.', parentId: 'literature', level: 2, wikiTitle: 'Non-fiction', children: [] },
        ]
      },
      {
        id: 'music', name: 'Music', slug: 'music', icon: '🎵',
        description: 'Art of organized sound including melody, harmony, rhythm, and composition.',
        parentId: 'culture-arts', level: 1, wikiTitle: 'Music',
        children: [
          { id: 'classical-music', name: 'Classical Music', slug: 'classical-music', icon: '🎻', description: 'Art music produced in Western traditions from medieval to contemporary.', parentId: 'music', level: 2, wikiTitle: 'Classical_music', children: [] },
          { id: 'popular-music', name: 'Popular Music', slug: 'popular-music', icon: '🎸', description: 'Music with wide appeal, distributed to large audiences.', parentId: 'music', level: 2, wikiTitle: 'Popular_music', children: [] },
          { id: 'electronic-music', name: 'Electronic Music', slug: 'electronic-music', icon: '🎧', description: 'Music produced primarily with electronic technology.', parentId: 'music', level: 2, wikiTitle: 'Electronic_music', children: [] },
        ]
      },
      {
        id: 'film', name: 'Film', slug: 'film', icon: '🎬',
        description: 'Motion picture art form including cinema, animation, and documentary.',
        parentId: 'culture-arts', level: 1, wikiTitle: 'Film',
        children: [
          { id: 'cinema', name: 'Cinema', slug: 'cinema', icon: '🎥', description: 'The art of making motion pictures.', parentId: 'film', level: 2, wikiTitle: 'Film_industry', children: [] },
          { id: 'animation', name: 'Animation', slug: 'animation', icon: '📺', description: 'Art of creating the illusion of movement through sequences of images.', parentId: 'film', level: 2, wikiTitle: 'Animation', children: [] },
          { id: 'documentary', name: 'Documentary', slug: 'documentary', icon: '🎞️', description: 'Non-fictional motion pictures intended to document reality.', parentId: 'film', level: 2, wikiTitle: 'Documentary_film', children: [] },
        ]
      },
    ]
  },
  {
    id: 'geography-places',
    name: 'Geography and Places',
    slug: 'geography-and-places',
    icon: '🌍',
    description: 'Countries, continents, cities, physical geography, maps, and the study of Earth\'s landscapes and environments.',
    parentId: null,
    level: 0,
    wikiTitle: 'Geography',
    children: [
      {
        id: 'continents', name: 'Continents', slug: 'continents', icon: '🗺️',
        description: 'The seven major landmasses of the world.',
        parentId: 'geography-places', level: 1, wikiTitle: 'Continent',
        children: [
          { id: 'africa', name: 'Africa', slug: 'africa', icon: '🌍', description: 'The second-largest and second-most populous continent.', parentId: 'continents', level: 2, wikiTitle: 'Africa', children: [] },
          { id: 'asia', name: 'Asia', slug: 'asia', icon: '🌏', description: 'The largest continent by area and population.', parentId: 'continents', level: 2, wikiTitle: 'Asia', children: [] },
          { id: 'europe', name: 'Europe', slug: 'europe', icon: '🌍', description: 'A continent located entirely in the Northern Hemisphere.', parentId: 'continents', level: 2, wikiTitle: 'Europe', children: [] },
          { id: 'north-america', name: 'North America', slug: 'north-america', icon: '🌎', description: 'A continent in the Northern and Western Hemispheres.', parentId: 'continents', level: 2, wikiTitle: 'North_America', children: [] },
          { id: 'south-america', name: 'South America', slug: 'south-america', icon: '🌎', description: 'A continent in the Western Hemisphere, mostly in the Southern Hemisphere.', parentId: 'continents', level: 2, wikiTitle: 'South_America', children: [] },
        ]
      },
      {
        id: 'physical-geography', name: 'Physical Geography', slug: 'physical-geography', icon: '⛰️',
        description: 'Study of natural features and processes of Earth\'s surface.',
        parentId: 'geography-places', level: 1, wikiTitle: 'Physical_geography',
        children: [
          { id: 'mountains', name: 'Mountains', slug: 'mountains', icon: '🏔️', description: 'Large natural elevations of the Earth\'s surface.', parentId: 'physical-geography', level: 2, wikiTitle: 'Mountain', children: [] },
          { id: 'oceans', name: 'Oceans', slug: 'oceans', icon: '🌊', description: 'Large bodies of saltwater that cover most of Earth\'s surface.', parentId: 'physical-geography', level: 2, wikiTitle: 'Ocean', children: [] },
          { id: 'rivers', name: 'Rivers', slug: 'rivers', icon: '🏞️', description: 'Natural flowing watercourses that flow towards oceans, seas, or lakes.', parentId: 'physical-geography', level: 2, wikiTitle: 'River', children: [] },
        ]
      },
      {
        id: 'urban-geography', name: 'Urban Geography', slug: 'urban-geography', icon: '🏙️',
        description: 'Study of cities, urbanization, and human settlement patterns.',
        parentId: 'geography-places', level: 1, wikiTitle: 'Urban_geography',
        children: [
          { id: 'cities', name: 'Cities', slug: 'cities', icon: '🌆', description: 'Large human settlements with complex systems of infrastructure.', parentId: 'urban-geography', level: 2, wikiTitle: 'City', children: [] },
          { id: 'urbanization', name: 'Urbanization', slug: 'urbanization', icon: '🏗️', description: 'The process of population concentration in urban areas.', parentId: 'urban-geography', level: 2, wikiTitle: 'Urbanization', children: [] },
        ]
      },
    ]
  },
  {
    id: 'health-fitness',
    name: 'Health and Fitness',
    slug: 'health-and-fitness',
    icon: '🏥',
    description: 'Medicine, nutrition, mental health, exercise, diseases, public health, and wellness topics.',
    parentId: null,
    level: 0,
    wikiTitle: 'Health',
    children: [
      {
        id: 'medicine', name: 'Medicine', slug: 'medicine', icon: '💊',
        description: 'The science and practice of diagnosing, treating, and preventing disease.',
        parentId: 'health-fitness', level: 1, wikiTitle: 'Medicine',
        children: [
          { id: 'surgery', name: 'Surgery', slug: 'surgery', icon: '🏥', description: 'Medical procedures involving manual or instrumental techniques.', parentId: 'medicine', level: 2, wikiTitle: 'Surgery', children: [] },
          { id: 'pharmacology', name: 'Pharmacology', slug: 'pharmacology', icon: '💉', description: 'The study of drug action and how drugs affect the body.', parentId: 'medicine', level: 2, wikiTitle: 'Pharmacology', children: [] },
          { id: 'pediatrics', name: 'Pediatrics', slug: 'pediatrics', icon: '👶', description: 'Medical care of infants, children, and adolescents.', parentId: 'medicine', level: 2, wikiTitle: 'Pediatrics', children: [] },
        ]
      },
      {
        id: 'nutrition', name: 'Nutrition', slug: 'nutrition', icon: '🥗',
        description: 'The study of nutrients in food and how the body uses them.',
        parentId: 'health-fitness', level: 1, wikiTitle: 'Nutrition',
        children: [
          { id: 'diet', name: 'Diet', slug: 'diet', icon: '🍎', description: 'The sum of food consumed by an organism or group.', parentId: 'nutrition', level: 2, wikiTitle: 'Diet_(nutrition)', children: [] },
          { id: 'vitamins', name: 'Vitamins', slug: 'vitamins', icon: '💊', description: 'Organic molecules essential nutrients for proper metabolic function.', parentId: 'nutrition', level: 2, wikiTitle: 'Vitamin', children: [] },
        ]
      },
      {
        id: 'mental-health', name: 'Mental Health', slug: 'mental-health', icon: '🧠',
        description: 'Emotional, psychological, and social well-being affecting thinking and behavior.',
        parentId: 'health-fitness', level: 1, wikiTitle: 'Mental_health',
        children: [
          { id: 'psychology', name: 'Psychology', slug: 'psychology', icon: '🔬', description: 'The scientific study of mind and behavior.', parentId: 'mental-health', level: 2, wikiTitle: 'Psychology', children: [] },
          { id: 'psychiatry', name: 'Psychiatry', slug: 'psychiatry', icon: '🏥', description: 'Medical specialty devoted to mental disorders.', parentId: 'mental-health', level: 2, wikiTitle: 'Psychiatry', children: [] },
        ]
      },
      {
        id: 'exercise', name: 'Exercise and Fitness', slug: 'exercise-and-fitness', icon: '🏋️',
        description: 'Physical activity and training for health and athletic performance.',
        parentId: 'health-fitness', level: 1, wikiTitle: 'Exercise',
        children: [
          { id: 'strength-training', name: 'Strength Training', slug: 'strength-training', icon: '💪', description: 'Physical exercise using resistance to build strength.', parentId: 'exercise', level: 2, wikiTitle: 'Strength_training', children: [] },
          { id: 'yoga', name: 'Yoga', slug: 'yoga', icon: '🧘', description: 'Physical, mental, and spiritual practices originating from ancient India.', parentId: 'exercise', level: 2, wikiTitle: 'Yoga', children: [] },
        ]
      },
    ]
  },
  {
    id: 'history-events',
    name: 'History and Events',
    slug: 'history-and-events',
    icon: '📜',
    description: 'World history, historical periods, civilizations, wars, revolutions, and significant events throughout human history.',
    parentId: null,
    level: 0,
    wikiTitle: 'History',
    children: [
      {
        id: 'ancient-history', name: 'Ancient History', slug: 'ancient-history', icon: '🏛️',
        description: 'History from the beginning of writing to the Early Middle Ages.',
        parentId: 'history-events', level: 1, wikiTitle: 'Ancient_history',
        children: [
          { id: 'ancient-egypt', name: 'Ancient Egypt', slug: 'ancient-egypt', icon: '🔺', description: 'Ancient civilization of northeastern Africa.', parentId: 'ancient-history', level: 2, wikiTitle: 'Ancient_Egypt', children: [] },
          { id: 'ancient-greece', name: 'Ancient Greece', slug: 'ancient-greece', icon: '🏛️', description: 'Civilization belonging to the period of Greek history.', parentId: 'ancient-history', level: 2, wikiTitle: 'Ancient_Greece', children: [] },
          { id: 'roman-empire', name: 'Roman Empire', slug: 'roman-empire', icon: '⚔️', description: 'The post-Republican period of ancient Roman civilization.', parentId: 'ancient-history', level: 2, wikiTitle: 'Roman_Empire', children: [] },
        ]
      },
      {
        id: 'modern-history', name: 'Modern History', slug: 'modern-history', icon: '🏭',
        description: 'History from the end of the Middle Ages to the present day.',
        parentId: 'history-events', level: 1, wikiTitle: 'Modern_history',
        children: [
          { id: 'industrial-revolution', name: 'Industrial Revolution', slug: 'industrial-revolution', icon: '🏭', description: 'The transition to new manufacturing processes.', parentId: 'modern-history', level: 2, wikiTitle: 'Industrial_Revolution', children: [] },
          { id: 'world-wars', name: 'World Wars', slug: 'world-wars', icon: '⚔️', description: 'The two largest global military conflicts in history.', parentId: 'modern-history', level: 2, wikiTitle: 'World_war', children: [] },
          { id: 'cold-war', name: 'Cold War', slug: 'cold-war', icon: '🧊', description: 'Geopolitical tension between the US and Soviet Union.', parentId: 'modern-history', level: 2, wikiTitle: 'Cold_War', children: [] },
        ]
      },
      {
        id: 'medieval-history', name: 'Medieval History', slug: 'medieval-history', icon: '🏰',
        description: 'The Middle Ages period in European history from 5th to 15th century.',
        parentId: 'history-events', level: 1, wikiTitle: 'Middle_Ages',
        children: [
          { id: 'feudalism', name: 'Feudalism', slug: 'feudalism', icon: '👑', description: 'Medieval political and economic system of land holding.', parentId: 'medieval-history', level: 2, wikiTitle: 'Feudalism', children: [] },
          { id: 'crusades', name: 'Crusades', slug: 'crusades', icon: '⚔️', description: 'Series of religious wars sanctioned by the Latin Church.', parentId: 'medieval-history', level: 2, wikiTitle: 'Crusades', children: [] },
        ]
      },
    ]
  },
  {
    id: 'human-activities',
    name: 'Human Activities',
    slug: 'human-activities',
    icon: '🏃',
    description: 'Sports, entertainment, recreation, games, hobbies, leisure activities, and everyday human pursuits.',
    parentId: null,
    level: 0,
    wikiTitle: 'Human_activity',
    children: [
      {
        id: 'sports', name: 'Sports', slug: 'sports', icon: '⚽',
        description: 'Competitive physical activities and games.',
        parentId: 'human-activities', level: 1, wikiTitle: 'Sport',
        children: [
          { id: 'football', name: 'Football', slug: 'football', icon: '⚽', description: 'Family of team sports involving kicking a ball.', parentId: 'sports', level: 2, wikiTitle: 'Association_football', children: [] },
          { id: 'basketball', name: 'Basketball', slug: 'basketball', icon: '🏀', description: 'Team sport played on a rectangular court.', parentId: 'sports', level: 2, wikiTitle: 'Basketball', children: [] },
          { id: 'tennis', name: 'Tennis', slug: 'tennis', icon: '🎾', description: 'Racket sport played individually or in pairs.', parentId: 'sports', level: 2, wikiTitle: 'Tennis', children: [] },
        ]
      },
      {
        id: 'entertainment', name: 'Entertainment', slug: 'entertainment', icon: '🎪',
        description: 'Activities that hold attention and interest of an audience.',
        parentId: 'human-activities', level: 1, wikiTitle: 'Entertainment',
        children: [
          { id: 'video-games', name: 'Video Games', slug: 'video-games', icon: '🎮', description: 'Electronic games played on various platforms.', parentId: 'entertainment', level: 2, wikiTitle: 'Video_game', children: [] },
          { id: 'board-games', name: 'Board Games', slug: 'board-games', icon: '♟️', description: 'Tabletop games involving pieces moved on a pre-marked board.', parentId: 'entertainment', level: 2, wikiTitle: 'Board_game', children: [] },
        ]
      },
      {
        id: 'cooking', name: 'Cooking', slug: 'cooking', icon: '🍳',
        description: 'The art and practice of preparing food for consumption.',
        parentId: 'human-activities', level: 1, wikiTitle: 'Cooking',
        children: [
          { id: 'baking', name: 'Baking', slug: 'baking', icon: '🍞', description: 'Cooking method using prolonged dry heat in an oven.', parentId: 'cooking', level: 2, wikiTitle: 'Baking', children: [] },
          { id: 'cuisines', name: 'World Cuisines', slug: 'world-cuisines', icon: '🍜', description: 'Traditional cooking styles characteristic of particular cultures.', parentId: 'cooking', level: 2, wikiTitle: 'Cuisine', children: [] },
        ]
      },
    ]
  },
  {
    id: 'mathematics-logic',
    name: 'Mathematics and Logic',
    slug: 'mathematics-and-logic',
    icon: '🔢',
    description: 'Pure mathematics, applied mathematics, statistics, logic, mathematical theories and formal systems.',
    parentId: null,
    level: 0,
    wikiTitle: 'Mathematics',
    children: [
      {
        id: 'pure-mathematics', name: 'Pure Mathematics', slug: 'pure-mathematics', icon: '📐',
        description: 'Mathematics studied for its intrinsic interest without application.',
        parentId: 'mathematics-logic', level: 1, wikiTitle: 'Pure_mathematics',
        children: [
          { id: 'algebra', name: 'Algebra', slug: 'algebra', icon: '➕', description: 'Branch of mathematics dealing with symbols and rules.', parentId: 'pure-mathematics', level: 2, wikiTitle: 'Algebra', children: [] },
          { id: 'geometry', name: 'Geometry', slug: 'geometry', icon: '📐', description: 'Branch of mathematics studying shapes, sizes, and properties of space.', parentId: 'pure-mathematics', level: 2, wikiTitle: 'Geometry', children: [] },
          { id: 'calculus', name: 'Calculus', slug: 'calculus', icon: '∫', description: 'Mathematical study of continuous change.', parentId: 'pure-mathematics', level: 2, wikiTitle: 'Calculus', children: [] },
        ]
      },
      {
        id: 'applied-mathematics', name: 'Applied Mathematics', slug: 'applied-mathematics', icon: '📊',
        description: 'Application of mathematics to solve real-world problems.',
        parentId: 'mathematics-logic', level: 1, wikiTitle: 'Applied_mathematics',
        children: [
          { id: 'statistics', name: 'Statistics', slug: 'statistics', icon: '📈', description: 'Science of collecting, analyzing, and presenting data.', parentId: 'applied-mathematics', level: 2, wikiTitle: 'Statistics', children: [] },
          { id: 'probability', name: 'Probability', slug: 'probability', icon: '🎲', description: 'Branch of mathematics concerning numerical descriptions of likelihood.', parentId: 'applied-mathematics', level: 2, wikiTitle: 'Probability', children: [] },
        ]
      },
      {
        id: 'logic', name: 'Logic', slug: 'logic', icon: '🧩',
        description: 'Study of correct reasoning and formal arguments.',
        parentId: 'mathematics-logic', level: 1, wikiTitle: 'Logic',
        children: [
          { id: 'formal-logic', name: 'Formal Logic', slug: 'formal-logic', icon: '📋', description: 'Logic using formal languages and symbolic methods.', parentId: 'logic', level: 2, wikiTitle: 'Mathematical_logic', children: [] },
          { id: 'set-theory', name: 'Set Theory', slug: 'set-theory', icon: '{ }', description: 'Branch of mathematics studying collections of objects.', parentId: 'logic', level: 2, wikiTitle: 'Set_theory', children: [] },
        ]
      },
    ]
  },
  {
    id: 'natural-sciences',
    name: 'Natural and Physical Sciences',
    slug: 'natural-and-physical-sciences',
    icon: '🔬',
    description: 'Physics, chemistry, biology, earth sciences, astronomy, and the study of the natural world.',
    parentId: null,
    level: 0,
    wikiTitle: 'Natural_science',
    children: [
      {
        id: 'physics', name: 'Physics', slug: 'physics', icon: '⚛️',
        description: 'Study of matter, energy, and fundamental forces of nature.',
        parentId: 'natural-sciences', level: 1, wikiTitle: 'Physics',
        children: [
          { id: 'quantum-mechanics', name: 'Quantum Mechanics', slug: 'quantum-mechanics', icon: '⚛️', description: 'Fundamental theory of physics at the smallest scales.', parentId: 'physics', level: 2, wikiTitle: 'Quantum_mechanics', children: [] },
          { id: 'thermodynamics', name: 'Thermodynamics', slug: 'thermodynamics', icon: '🌡️', description: 'Branch of physics dealing with heat and temperature.', parentId: 'physics', level: 2, wikiTitle: 'Thermodynamics', children: [] },
          { id: 'astrophysics', name: 'Astrophysics', slug: 'astrophysics', icon: '🌟', description: 'Branch of astronomy applying laws of physics to celestial objects.', parentId: 'physics', level: 2, wikiTitle: 'Astrophysics', children: [] },
        ]
      },
      {
        id: 'chemistry', name: 'Chemistry', slug: 'chemistry', icon: '🧪',
        description: 'Study of matter, its properties, composition, and reactions.',
        parentId: 'natural-sciences', level: 1, wikiTitle: 'Chemistry',
        children: [
          { id: 'organic-chemistry', name: 'Organic Chemistry', slug: 'organic-chemistry', icon: '🧬', description: 'Study of carbon-containing compounds and their reactions.', parentId: 'chemistry', level: 2, wikiTitle: 'Organic_chemistry', children: [] },
          { id: 'biochemistry', name: 'Biochemistry', slug: 'biochemistry', icon: '🧫', description: 'Study of chemical processes within and relating to living organisms.', parentId: 'chemistry', level: 2, wikiTitle: 'Biochemistry', children: [] },
        ]
      },
      {
        id: 'biology', name: 'Biology', slug: 'biology', icon: '🧬',
        description: 'Study of living organisms and their interactions with the environment.',
        parentId: 'natural-sciences', level: 1, wikiTitle: 'Biology',
        children: [
          { id: 'genetics', name: 'Genetics', slug: 'genetics', icon: '🧬', description: 'Study of genes, genetic variation, and heredity.', parentId: 'biology', level: 2, wikiTitle: 'Genetics', children: [] },
          { id: 'ecology', name: 'Ecology', slug: 'ecology', icon: '🌿', description: 'Study of organisms and their interactions with the environment.', parentId: 'biology', level: 2, wikiTitle: 'Ecology', children: [] },
          { id: 'evolution', name: 'Evolution', slug: 'evolution', icon: '🦎', description: 'Change in heritable characteristics of populations over generations.', parentId: 'biology', level: 2, wikiTitle: 'Evolution', children: [] },
        ]
      },
      {
        id: 'earth-science', name: 'Earth Science', slug: 'earth-science', icon: '🌋',
        description: 'Study of Earth and its atmosphere, including geology and meteorology.',
        parentId: 'natural-sciences', level: 1, wikiTitle: 'Earth_science',
        children: [
          { id: 'geology', name: 'Geology', slug: 'geology', icon: '🪨', description: 'Study of the solid Earth, rocks, and formation processes.', parentId: 'earth-science', level: 2, wikiTitle: 'Geology', children: [] },
          { id: 'meteorology', name: 'Meteorology', slug: 'meteorology', icon: '🌦️', description: 'Study of the atmosphere, weather, and climate.', parentId: 'earth-science', level: 2, wikiTitle: 'Meteorology', children: [] },
        ]
      },
    ]
  },
  {
    id: 'people-self',
    name: 'People and Self',
    slug: 'people-and-self',
    icon: '👥',
    description: 'Biography, personal development, identity, relationships, gender, ethnicity, and the human experience.',
    parentId: null,
    level: 0,
    wikiTitle: 'Person',
    children: [
      {
        id: 'biography', name: 'Biography', slug: 'biography', icon: '📖',
        description: 'Detailed descriptions of notable people\'s lives.',
        parentId: 'people-self', level: 1, wikiTitle: 'Biography',
        children: [
          { id: 'scientists', name: 'Scientists', slug: 'scientists', icon: '👨‍🔬', description: 'Notable individuals who have contributed to scientific knowledge.', parentId: 'biography', level: 2, wikiTitle: 'Scientist', children: [] },
          { id: 'artists', name: 'Artists', slug: 'artists', icon: '👩‍🎨', description: 'Notable individuals in the visual and performing arts.', parentId: 'biography', level: 2, wikiTitle: 'Artist', children: [] },
          { id: 'leaders', name: 'Political Leaders', slug: 'political-leaders', icon: '👔', description: 'Notable heads of state and political figures throughout history.', parentId: 'biography', level: 2, wikiTitle: 'Head_of_state', children: [] },
        ]
      },
      {
        id: 'personal-development', name: 'Personal Development', slug: 'personal-development', icon: '🌱',
        description: 'Self-improvement, learning, and personal growth activities.',
        parentId: 'people-self', level: 1, wikiTitle: 'Personal_development',
        children: [
          { id: 'self-help', name: 'Self-Help', slug: 'self-help', icon: '📘', description: 'Self-guided improvement and self-improvement methods.', parentId: 'personal-development', level: 2, wikiTitle: 'Self-help', children: [] },
          { id: 'mindfulness', name: 'Mindfulness', slug: 'mindfulness', icon: '🧘', description: 'Practice of purposely bringing attention to present experience.', parentId: 'personal-development', level: 2, wikiTitle: 'Mindfulness', children: [] },
        ]
      },
    ]
  },
  {
    id: 'philosophy-thinking',
    name: 'Philosophy and Thinking',
    slug: 'philosophy-and-thinking',
    icon: '🤔',
    description: 'Philosophy, epistemology, ethics, metaphysics, critical thinking, and the pursuit of fundamental truths.',
    parentId: null,
    level: 0,
    wikiTitle: 'Philosophy',
    children: [
      {
        id: 'ethics', name: 'Ethics', slug: 'ethics', icon: '⚖️',
        description: 'Branch of philosophy examining concepts of right and wrong.',
        parentId: 'philosophy-thinking', level: 1, wikiTitle: 'Ethics',
        children: [
          { id: 'bioethics', name: 'Bioethics', slug: 'bioethics', icon: '🧬', description: 'Philosophical study of ethical issues in biology and medicine.', parentId: 'ethics', level: 2, wikiTitle: 'Bioethics', children: [] },
          { id: 'political-ethics', name: 'Political Ethics', slug: 'political-ethics', icon: '🏛️', description: 'Ethics applied to politics and public policy.', parentId: 'ethics', level: 2, wikiTitle: 'Political_ethics', children: [] },
        ]
      },
      {
        id: 'metaphysics', name: 'Metaphysics', slug: 'metaphysics', icon: '🔮',
        description: 'Branch of philosophy exploring the fundamental nature of reality.',
        parentId: 'philosophy-thinking', level: 1, wikiTitle: 'Metaphysics',
        children: [
          { id: 'ontology', name: 'Ontology', slug: 'ontology', icon: '🌀', description: 'Philosophical study of the nature of being and existence.', parentId: 'metaphysics', level: 2, wikiTitle: 'Ontology', children: [] },
          { id: 'cosmology-phil', name: 'Cosmology', slug: 'cosmology-philosophy', icon: '🌌', description: 'Study of the origin and nature of the universe.', parentId: 'metaphysics', level: 2, wikiTitle: 'Cosmology', children: [] },
        ]
      },
      {
        id: 'epistemology', name: 'Epistemology', slug: 'epistemology', icon: '💡',
        description: 'Study of the nature, sources, and limits of knowledge.',
        parentId: 'philosophy-thinking', level: 1, wikiTitle: 'Epistemology',
        children: [
          { id: 'rationalism', name: 'Rationalism', slug: 'rationalism', icon: '🧠', description: 'Theory that reason is the chief source of knowledge.', parentId: 'epistemology', level: 2, wikiTitle: 'Rationalism', children: [] },
          { id: 'empiricism', name: 'Empiricism', slug: 'empiricism', icon: '🔍', description: 'Theory that knowledge comes only from sensory experience.', parentId: 'epistemology', level: 2, wikiTitle: 'Empiricism', children: [] },
        ]
      },
    ]
  },
  {
    id: 'reference-works',
    name: 'Reference Works',
    slug: 'reference-works',
    icon: '📚',
    description: 'Encyclopedias, dictionaries, atlases, almanacs, bibliographies, and other reference resources.',
    parentId: null,
    level: 0,
    wikiTitle: 'Reference_work',
    children: [
      {
        id: 'encyclopedias', name: 'Encyclopedias', slug: 'encyclopedias', icon: '📕',
        description: 'Comprehensive references covering all branches of knowledge.',
        parentId: 'reference-works', level: 1, wikiTitle: 'Encyclopedia',
        children: [
          { id: 'online-encyclopedias', name: 'Online Encyclopedias', slug: 'online-encyclopedias', icon: '🌐', description: 'Digital encyclopedias accessible via the internet.', parentId: 'encyclopedias', level: 2, wikiTitle: 'Online_encyclopedia', children: [] },
        ]
      },
      {
        id: 'dictionaries', name: 'Dictionaries', slug: 'dictionaries', icon: '📗',
        description: 'Reference works listing words and their definitions.',
        parentId: 'reference-works', level: 1, wikiTitle: 'Dictionary',
        children: [
          { id: 'linguistics', name: 'Linguistics', slug: 'linguistics', icon: '🗣️', description: 'Scientific study of language and its structure.', parentId: 'dictionaries', level: 2, wikiTitle: 'Linguistics', children: [] },
        ]
      },
      {
        id: 'libraries', name: 'Libraries', slug: 'libraries', icon: '🏛️',
        description: 'Institutions housing collections of books and other resources.',
        parentId: 'reference-works', level: 1, wikiTitle: 'Library',
        children: [
          { id: 'digital-libraries', name: 'Digital Libraries', slug: 'digital-libraries', icon: '💻', description: 'Collections of digital objects including text, visual material, and audio.', parentId: 'libraries', level: 2, wikiTitle: 'Digital_library', children: [] },
        ]
      },
    ]
  },
  {
    id: 'religion-belief',
    name: 'Religion and Belief Systems',
    slug: 'religion-and-belief-systems',
    icon: '🕊️',
    description: 'World religions, philosophy of religion, spirituality, mythology, and belief systems.',
    parentId: null,
    level: 0,
    wikiTitle: 'Religion',
    children: [
      {
        id: 'world-religions', name: 'World Religions', slug: 'world-religions', icon: '🕊️',
        description: 'Major organized religions of the world.',
        parentId: 'religion-belief', level: 1, wikiTitle: 'Major_religious_groups',
        children: [
          { id: 'christianity', name: 'Christianity', slug: 'christianity', icon: '✝️', description: 'Abrahamic monotheistic religion based on the life of Jesus.', parentId: 'world-religions', level: 2, wikiTitle: 'Christianity', children: [] },
          { id: 'islam', name: 'Islam', slug: 'islam', icon: '☪️', description: 'Abrahamic monotheistic religion based on the Quran.', parentId: 'world-religions', level: 2, wikiTitle: 'Islam', children: [] },
          { id: 'buddhism', name: 'Buddhism', slug: 'buddhism', icon: '☸️', description: 'Indian religion based on the teachings of Gautama Buddha.', parentId: 'world-religions', level: 2, wikiTitle: 'Buddhism', children: [] },
          { id: 'hinduism', name: 'Hinduism', slug: 'hinduism', icon: '🕉️', description: 'Indian religion and dharma, the world\'s oldest organized religion.', parentId: 'world-religions', level: 2, wikiTitle: 'Hinduism', children: [] },
        ]
      },
      {
        id: 'mythology', name: 'Mythology', slug: 'mythology', icon: '🐉',
        description: 'Collection of myths of a group including cosmology and deities.',
        parentId: 'religion-belief', level: 1, wikiTitle: 'Mythology',
        children: [
          { id: 'greek-mythology', name: 'Greek Mythology', slug: 'greek-mythology', icon: '⚡', description: 'Body of myths originally told by the ancient Greeks.', parentId: 'mythology', level: 2, wikiTitle: 'Greek_mythology', children: [] },
          { id: 'norse-mythology', name: 'Norse Mythology', slug: 'norse-mythology', icon: '🔨', description: 'Mythology of the North Germanic peoples.', parentId: 'mythology', level: 2, wikiTitle: 'Norse_mythology', children: [] },
        ]
      },
      {
        id: 'spirituality', name: 'Spirituality', slug: 'spirituality', icon: '✨',
        description: 'Concepts relating to the spirit, sacred matters, and transcendence.',
        parentId: 'religion-belief', level: 1, wikiTitle: 'Spirituality',
        children: [
          { id: 'meditation', name: 'Meditation', slug: 'meditation', icon: '🧘', description: 'Practice of focused concentration or reflection.', parentId: 'spirituality', level: 2, wikiTitle: 'Meditation', children: [] },
        ]
      },
    ]
  },
  {
    id: 'society-social',
    name: 'Society and Social Sciences',
    slug: 'society-and-social-sciences',
    icon: '🏛️',
    description: 'Economics, politics, law, sociology, education, government, and the study of human society.',
    parentId: null,
    level: 0,
    wikiTitle: 'Social_science',
    children: [
      {
        id: 'economics', name: 'Economics', slug: 'economics', icon: '💰',
        description: 'Study of production, distribution, and consumption of goods and services.',
        parentId: 'society-social', level: 1, wikiTitle: 'Economics',
        children: [
          { id: 'microeconomics', name: 'Microeconomics', slug: 'microeconomics', icon: '📊', description: 'Study of individual and business economic decisions.', parentId: 'economics', level: 2, wikiTitle: 'Microeconomics', children: [] },
          { id: 'macroeconomics', name: 'Macroeconomics', slug: 'macroeconomics', icon: '🌐', description: 'Study of economy-wide phenomena.', parentId: 'economics', level: 2, wikiTitle: 'Macroeconomics', children: [] },
          { id: 'finance', name: 'Finance', slug: 'finance', icon: '🏦', description: 'Management of money and investing.', parentId: 'economics', level: 2, wikiTitle: 'Finance', children: [] },
        ]
      },
      {
        id: 'politics', name: 'Politics', slug: 'politics', icon: '🗳️',
        description: 'Activities associated with governance and public decision-making.',
        parentId: 'society-social', level: 1, wikiTitle: 'Politics',
        children: [
          { id: 'democracy', name: 'Democracy', slug: 'democracy', icon: '🗳️', description: 'System of government where citizens exercise power by voting.', parentId: 'politics', level: 2, wikiTitle: 'Democracy', children: [] },
          { id: 'international-relations', name: 'International Relations', slug: 'international-relations', icon: '🤝', description: 'Study of relationships between countries.', parentId: 'politics', level: 2, wikiTitle: 'International_relations', children: [] },
        ]
      },
      {
        id: 'law', name: 'Law', slug: 'law', icon: '⚖️',
        description: 'System of rules created and enforced through social or governmental institutions.',
        parentId: 'society-social', level: 1, wikiTitle: 'Law',
        children: [
          { id: 'criminal-law', name: 'Criminal Law', slug: 'criminal-law', icon: '🔒', description: 'Body of law relating to crime and punishment.', parentId: 'law', level: 2, wikiTitle: 'Criminal_law', children: [] },
          { id: 'human-rights', name: 'Human Rights', slug: 'human-rights', icon: '✊', description: 'Moral principles describing standards of human behavior.', parentId: 'law', level: 2, wikiTitle: 'Human_rights', children: [] },
        ]
      },
      {
        id: 'education', name: 'Education', slug: 'education', icon: '🎓',
        description: 'Process of facilitating learning and acquiring knowledge.',
        parentId: 'society-social', level: 1, wikiTitle: 'Education',
        children: [
          { id: 'higher-education', name: 'Higher Education', slug: 'higher-education', icon: '🏫', description: 'Tertiary education leading to academic degrees.', parentId: 'education', level: 2, wikiTitle: 'Higher_education', children: [] },
          { id: 'online-learning', name: 'Online Learning', slug: 'online-learning', icon: '💻', description: 'Education delivered through digital platforms.', parentId: 'education', level: 2, wikiTitle: 'Educational_technology', children: [] },
        ]
      },
    ]
  },
  {
    id: 'technology-applied',
    name: 'Technology and Applied Sciences',
    slug: 'technology-and-applied-sciences',
    icon: '💻',
    description: 'Computing, engineering, agriculture, transportation, communication technology, energy, and applied sciences.',
    parentId: null,
    level: 0,
    wikiTitle: 'Technology',
    children: [
      {
        id: 'computing', name: 'Computing', slug: 'computing', icon: '🖥️',
        description: 'Theory and practice of using computers and software.',
        parentId: 'technology-applied', level: 1, wikiTitle: 'Computing',
        children: [
          {
            id: 'programming', name: 'Programming', slug: 'programming', icon: '👨‍💻',
            description: 'Process of creating instructions for computers.',
            parentId: 'computing', level: 2, wikiTitle: 'Computer_programming',
            children: [
              { id: 'python', name: 'Python', slug: 'python', icon: '🐍', description: 'High-level general-purpose programming language.', parentId: 'programming', level: 3, wikiTitle: 'Python_(programming_language)', children: [] },
              { id: 'javascript', name: 'JavaScript', slug: 'javascript', icon: '📜', description: 'High-level programming language for the web.', parentId: 'programming', level: 3, wikiTitle: 'JavaScript', children: [] },
              { id: 'java', name: 'Java', slug: 'java', icon: '☕', description: 'Class-based object-oriented programming language.', parentId: 'programming', level: 3, wikiTitle: 'Java_(programming_language)', children: [] },
              { id: 'cpp', name: 'C++', slug: 'cpp', icon: '⚙️', description: 'General-purpose programming language with low-level memory manipulation.', parentId: 'programming', level: 3, wikiTitle: 'C%2B%2B', children: [] },
              { id: 'rust-lang', name: 'Rust', slug: 'rust-lang', icon: '🦀', description: 'Systems programming language focused on safety and performance.', parentId: 'programming', level: 3, wikiTitle: 'Rust_(programming_language)', children: [] },
              { id: 'go-lang', name: 'Go', slug: 'go-lang', icon: '🐹', description: 'Statically typed compiled language designed at Google.', parentId: 'programming', level: 3, wikiTitle: 'Go_(programming_language)', children: [] },
            ]
          },
          {
            id: 'artificial-intelligence', name: 'Artificial Intelligence', slug: 'artificial-intelligence', icon: '🤖',
            description: 'Intelligence demonstrated by machines.',
            parentId: 'computing', level: 2, wikiTitle: 'Artificial_intelligence',
            children: [
              { id: 'machine-learning', name: 'Machine Learning', slug: 'machine-learning', icon: '📊', description: 'Study of algorithms that improve through experience and data.', parentId: 'artificial-intelligence', level: 3, wikiTitle: 'Machine_learning', children: [] },
              { id: 'nlp', name: 'Natural Language Processing', slug: 'natural-language-processing', icon: '💬', description: 'AI subfield dealing with interaction between computers and human language.', parentId: 'artificial-intelligence', level: 3, wikiTitle: 'Natural_language_processing', children: [] },
              { id: 'computer-vision', name: 'Computer Vision', slug: 'computer-vision', icon: '👁️', description: 'Field enabling computers to gain understanding from digital images.', parentId: 'artificial-intelligence', level: 3, wikiTitle: 'Computer_vision', children: [] },
              { id: 'neural-networks', name: 'Neural Networks', slug: 'neural-networks', icon: '🧠', description: 'Computing systems inspired by biological neural networks.', parentId: 'artificial-intelligence', level: 3, wikiTitle: 'Artificial_neural_network', children: [] },
              { id: 'robotics', name: 'Robotics', slug: 'robotics', icon: '🦾', description: 'Design, construction, and operation of robots.', parentId: 'artificial-intelligence', level: 3, wikiTitle: 'Robotics', children: [] },
              { id: 'deep-learning', name: 'Deep Learning', slug: 'deep-learning', icon: '🔮', description: 'Machine learning based on artificial neural networks with multiple layers.', parentId: 'artificial-intelligence', level: 3, wikiTitle: 'Deep_learning', children: [] },
            ]
          },
          {
            id: 'cybersecurity', name: 'Cybersecurity', slug: 'cybersecurity', icon: '🔐',
            description: 'Protection of computer systems from theft or damage.',
            parentId: 'computing', level: 2, wikiTitle: 'Computer_security',
            children: [
              { id: 'cryptography', name: 'Cryptography', slug: 'cryptography', icon: '🔑', description: 'Practice of secure communication techniques.', parentId: 'cybersecurity', level: 3, wikiTitle: 'Cryptography', children: [] },
              { id: 'network-security', name: 'Network Security', slug: 'network-security', icon: '🛡️', description: 'Protection of computer networks from unauthorized access.', parentId: 'cybersecurity', level: 3, wikiTitle: 'Network_security', children: [] },
              { id: 'ethical-hacking', name: 'Ethical Hacking', slug: 'ethical-hacking', icon: '🎯', description: 'Authorized practice of bypassing system security to identify vulnerabilities.', parentId: 'cybersecurity', level: 3, wikiTitle: 'Certified_Ethical_Hacker', children: [] },
              { id: 'malware-analysis', name: 'Malware Analysis', slug: 'malware-analysis', icon: '🦠', description: 'Study of malicious software to understand its behavior.', parentId: 'cybersecurity', level: 3, wikiTitle: 'Malware_analysis', children: [] },
            ]
          },
          {
            id: 'data-science', name: 'Data Science', slug: 'data-science', icon: '📈',
            description: 'Interdisciplinary field using scientific methods to extract knowledge from data.',
            parentId: 'computing', level: 2, wikiTitle: 'Data_science',
            children: [
              { id: 'big-data', name: 'Big Data', slug: 'big-data', icon: '💾', description: 'Extremely large datasets that may be analyzed computationally.', parentId: 'data-science', level: 3, wikiTitle: 'Big_data', children: [] },
              { id: 'data-visualization', name: 'Data Visualization', slug: 'data-visualization', icon: '📊', description: 'Graphical representation of information and data.', parentId: 'data-science', level: 3, wikiTitle: 'Data_and_information_visualization', children: [] },
              { id: 'databases', name: 'Databases', slug: 'databases', icon: '🗄️', description: 'Organized collections of structured data.', parentId: 'data-science', level: 3, wikiTitle: 'Database', children: [] },
            ]
          },
          {
            id: 'software-engineering', name: 'Software Engineering', slug: 'software-engineering', icon: '🏗️',
            description: 'Systematic approach to the development and maintenance of software.',
            parentId: 'computing', level: 2, wikiTitle: 'Software_engineering',
            children: [
              { id: 'devops', name: 'DevOps', slug: 'devops', icon: '🔄', description: 'Set of practices combining software development and IT operations.', parentId: 'software-engineering', level: 3, wikiTitle: 'DevOps', children: [] },
              { id: 'agile', name: 'Agile Methodology', slug: 'agile-methodology', icon: '🏃', description: 'Iterative approach to software delivery.', parentId: 'software-engineering', level: 3, wikiTitle: 'Agile_software_development', children: [] },
              { id: 'open-source', name: 'Open Source', slug: 'open-source', icon: '🌐', description: 'Software with source code freely available for modification.', parentId: 'software-engineering', level: 3, wikiTitle: 'Open-source_software', children: [] },
            ]
          },
        ]
      },
      {
        id: 'engineering', name: 'Engineering', slug: 'engineering', icon: '⚙️',
        description: 'Application of scientific knowledge to solve technical problems.',
        parentId: 'technology-applied', level: 1, wikiTitle: 'Engineering',
        children: [
          {
            id: 'civil-engineering', name: 'Civil Engineering', slug: 'civil-engineering', icon: '🌉',
            description: 'Design and construction of infrastructure.',
            parentId: 'engineering', level: 2, wikiTitle: 'Civil_engineering',
            children: [
              { id: 'structural-eng', name: 'Structural Engineering', slug: 'structural-engineering', icon: '🏗️', description: 'Analysis and design of structures that support loads.', parentId: 'civil-engineering', level: 3, wikiTitle: 'Structural_engineering', children: [] },
              { id: 'geotechnical-eng', name: 'Geotechnical Engineering', slug: 'geotechnical-engineering', icon: '🪨', description: 'Engineering behavior of earth materials.', parentId: 'civil-engineering', level: 3, wikiTitle: 'Geotechnical_engineering', children: [] },
              { id: 'transportation-eng', name: 'Transportation Engineering', slug: 'transportation-engineering', icon: '🛣️', description: 'Planning, design, and operation of transportation systems.', parentId: 'civil-engineering', level: 3, wikiTitle: 'Transportation_engineering', children: [] },
            ]
          },
          {
            id: 'electrical-engineering', name: 'Electrical Engineering', slug: 'electrical-engineering', icon: '⚡',
            description: 'Engineering dealing with electricity and electronics.',
            parentId: 'engineering', level: 2, wikiTitle: 'Electrical_engineering',
            children: [
              { id: 'power-systems', name: 'Power Systems', slug: 'power-systems', icon: '🔌', description: 'Network of electrical components for power delivery.', parentId: 'electrical-engineering', level: 3, wikiTitle: 'Electric_power_system', children: [] },
              { id: 'electronics', name: 'Electronics', slug: 'electronics', icon: '📟', description: 'Science of controlling electrical energy.', parentId: 'electrical-engineering', level: 3, wikiTitle: 'Electronics', children: [] },
              { id: 'signal-processing', name: 'Signal Processing', slug: 'signal-processing', icon: '📡', description: 'Analysis and manipulation of signals.', parentId: 'electrical-engineering', level: 3, wikiTitle: 'Signal_processing', children: [] },
            ]
          },
          {
            id: 'mechanical-engineering', name: 'Mechanical Engineering', slug: 'mechanical-engineering', icon: '🔧',
            description: 'Design of mechanical systems and thermal devices.',
            parentId: 'engineering', level: 2, wikiTitle: 'Mechanical_engineering',
            children: [
              { id: 'thermodynamics-eng', name: 'Thermodynamics', slug: 'thermodynamics-engineering', icon: '🌡️', description: 'Study of heat, work, temperature and their relation to energy.', parentId: 'mechanical-engineering', level: 3, wikiTitle: 'Thermodynamics', children: [] },
              { id: 'robotics-eng', name: 'Robotics Engineering', slug: 'robotics-engineering', icon: '🤖', description: 'Design and manufacturing of robots.', parentId: 'mechanical-engineering', level: 3, wikiTitle: 'Robotics', children: [] },
              { id: 'cad', name: 'CAD/CAM', slug: 'cad-cam', icon: '📐', description: 'Computer-aided design and manufacturing.', parentId: 'mechanical-engineering', level: 3, wikiTitle: 'Computer-aided_design', children: [] },
              { id: 'materials-science', name: 'Materials Science', slug: 'materials-science', icon: '🔬', description: 'Interdisciplinary field of discovering and designing new materials.', parentId: 'mechanical-engineering', level: 3, wikiTitle: 'Materials_science', children: [] },
            ]
          },
          {
            id: 'chemical-engineering', name: 'Chemical Engineering', slug: 'chemical-engineering', icon: '🧪',
            description: 'Engineering discipline applying chemistry, physics, and mathematics to chemical processes.',
            parentId: 'engineering', level: 2, wikiTitle: 'Chemical_engineering',
            children: [
              { id: 'process-engineering', name: 'Process Engineering', slug: 'process-engineering', icon: '🏭', description: 'Design and optimization of industrial processes.', parentId: 'chemical-engineering', level: 3, wikiTitle: 'Process_engineering', children: [] },
              { id: 'biomedical-eng', name: 'Biomedical Engineering', slug: 'biomedical-engineering', icon: '🏥', description: 'Application of engineering to medicine and biology.', parentId: 'chemical-engineering', level: 3, wikiTitle: 'Biomedical_engineering', children: [] },
            ]
          },
          {
            id: 'aerospace-engineering', name: 'Aerospace Engineering', slug: 'aerospace-engineering', icon: '🚀',
            description: 'Engineering discipline dealing with aircraft and spacecraft.',
            parentId: 'engineering', level: 2, wikiTitle: 'Aerospace_engineering',
            children: [
              { id: 'aeronautics', name: 'Aeronautics', slug: 'aeronautics', icon: '✈️', description: 'Science of flight within Earth\'s atmosphere.', parentId: 'aerospace-engineering', level: 3, wikiTitle: 'Aeronautics', children: [] },
              { id: 'astronautics', name: 'Astronautics', slug: 'astronautics', icon: '🛰️', description: 'Science and technology of space travel.', parentId: 'aerospace-engineering', level: 3, wikiTitle: 'Astronautics', children: [] },
            ]
          },
        ]
      },
      {
        id: 'communication-tech', name: 'Communication Technology', slug: 'communication-technology', icon: '📡',
        description: 'Technologies for transferring information between people.',
        parentId: 'technology-applied', level: 1, wikiTitle: 'Communication',
        children: [
          {
            id: 'internet', name: 'Internet', slug: 'internet', icon: '🌐',
            description: 'Global system of interconnected computer networks.',
            parentId: 'communication-tech', level: 2, wikiTitle: 'Internet',
            children: [
              { id: 'web-development', name: 'Web Development', slug: 'web-development', icon: '💻', description: 'Work involved in developing websites and web applications.', parentId: 'internet', level: 3, wikiTitle: 'Web_development', children: [] },
              { id: 'cloud-computing', name: 'Cloud Computing', slug: 'cloud-computing', icon: '☁️', description: 'On-demand availability of computer system resources.', parentId: 'internet', level: 3, wikiTitle: 'Cloud_computing', children: [] },
              { id: 'iot', name: 'Internet of Things', slug: 'internet-of-things', icon: '📲', description: 'Network of physical objects embedded with sensors and connectivity.', parentId: 'internet', level: 3, wikiTitle: 'Internet_of_things', children: [] },
              { id: 'blockchain', name: 'Blockchain', slug: 'blockchain', icon: '⛓️', description: 'Distributed ledger technology for secure digital transactions.', parentId: 'internet', level: 3, wikiTitle: 'Blockchain', children: [] },
            ]
          },
          {
            id: 'telecommunications', name: 'Telecommunications', slug: 'telecommunications', icon: '📞',
            description: 'Transmission of information over significant distances.',
            parentId: 'communication-tech', level: 2, wikiTitle: 'Telecommunications',
            children: [
              { id: '5g', name: '5G Networks', slug: '5g-networks', icon: '📶', description: 'Fifth generation mobile network technology.', parentId: 'telecommunications', level: 3, wikiTitle: '5G', children: [] },
              { id: 'satellite-comm', name: 'Satellite Communication', slug: 'satellite-communication', icon: '🛰️', description: 'Use of communication satellites for signals.', parentId: 'telecommunications', level: 3, wikiTitle: 'Communications_satellite', children: [] },
              { id: 'fiber-optics', name: 'Fiber Optics', slug: 'fiber-optics', icon: '💡', description: 'Technology using glass or plastic threads to transmit data.', parentId: 'telecommunications', level: 3, wikiTitle: 'Fiber-optic_communication', children: [] },
            ]
          },
          {
            id: 'media-tech', name: 'Media Technology', slug: 'media-technology', icon: '📺',
            description: 'Technologies for creating, distributing, and consuming media content.',
            parentId: 'communication-tech', level: 2, wikiTitle: 'Media_technology',
            children: [
              { id: 'social-media', name: 'Social Media', slug: 'social-media', icon: '📱', description: 'Interactive platforms for creating and sharing content.', parentId: 'media-tech', level: 3, wikiTitle: 'Social_media', children: [] },
              { id: 'streaming', name: 'Streaming Media', slug: 'streaming-media', icon: '▶️', description: 'Multimedia delivered and consumed in a continuous manner.', parentId: 'media-tech', level: 3, wikiTitle: 'Streaming_media', children: [] },
            ]
          },
        ]
      },
      {
        id: 'agriculture', name: 'Agriculture', slug: 'agriculture', icon: '🌾',
        description: 'The science and practice of farming, including cultivation and breeding.',
        parentId: 'technology-applied', level: 1, wikiTitle: 'Agriculture',
        children: [
          {
            id: 'crop-science', name: 'Crop Science', slug: 'crop-science', icon: '🌱',
            description: 'Study of crop plants, their growth, and production.',
            parentId: 'agriculture', level: 2, wikiTitle: 'Crop_science',
            children: [
              { id: 'agronomy', name: 'Agronomy', slug: 'agronomy', icon: '🧑‍🌾', description: 'Science and technology of producing and using plants.', parentId: 'crop-science', level: 3, wikiTitle: 'Agronomy', children: [] },
              { id: 'horticulture', name: 'Horticulture', slug: 'horticulture', icon: '🌺', description: 'Agriculture of plants for food, materials, and decoration.', parentId: 'crop-science', level: 3, wikiTitle: 'Horticulture', children: [] },
              { id: 'precision-agriculture', name: 'Precision Agriculture', slug: 'precision-agriculture', icon: '🛰️', description: 'Farm management using technology and data.', parentId: 'crop-science', level: 3, wikiTitle: 'Precision_agriculture', children: [] },
            ]
          },
          {
            id: 'animal-husbandry', name: 'Animal Husbandry', slug: 'animal-husbandry', icon: '🐄',
            description: 'Branch of agriculture concerned with raising animals.',
            parentId: 'agriculture', level: 2, wikiTitle: 'Animal_husbandry',
            children: [
              { id: 'dairy-farming', name: 'Dairy Farming', slug: 'dairy-farming', icon: '🥛', description: 'Long-term production of milk for processing.', parentId: 'animal-husbandry', level: 3, wikiTitle: 'Dairy_farming', children: [] },
              { id: 'aquaculture', name: 'Aquaculture', slug: 'aquaculture', icon: '🐟', description: 'Farming of fish, crustaceans, and aquatic plants.', parentId: 'animal-husbandry', level: 3, wikiTitle: 'Aquaculture', children: [] },
            ]
          },
          {
            id: 'food-science', name: 'Food Science', slug: 'food-science', icon: '🍽️',
            description: 'Study of the physical, biological, and chemical makeup of food.',
            parentId: 'agriculture', level: 2, wikiTitle: 'Food_science',
            children: [
              { id: 'food-processing', name: 'Food Processing', slug: 'food-processing', icon: '🏭', description: 'Transformation of agricultural products into food.', parentId: 'food-science', level: 3, wikiTitle: 'Food_processing', children: [] },
              { id: 'food-safety', name: 'Food Safety', slug: 'food-safety', icon: '✅', description: 'Scientific discipline of handling and storage of food.', parentId: 'food-science', level: 3, wikiTitle: 'Food_safety', children: [] },
            ]
          },
        ]
      },
      {
        id: 'transportation', name: 'Transportation', slug: 'transportation', icon: '🚗',
        description: 'Movement of people and goods from one location to another.',
        parentId: 'technology-applied', level: 1, wikiTitle: 'Transport',
        children: [
          {
            id: 'automotive', name: 'Automotive', slug: 'automotive', icon: '🚙',
            description: 'Design, production, and use of motor vehicles.',
            parentId: 'transportation', level: 2, wikiTitle: 'Automotive_industry',
            children: [
              { id: 'electric-vehicles', name: 'Electric Vehicles', slug: 'electric-vehicles', icon: '🔋', description: 'Vehicles powered by electric motors.', parentId: 'automotive', level: 3, wikiTitle: 'Electric_vehicle', children: [] },
              { id: 'autonomous-vehicles', name: 'Autonomous Vehicles', slug: 'autonomous-vehicles', icon: '🤖', description: 'Self-driving vehicles using AI and sensors.', parentId: 'automotive', level: 3, wikiTitle: 'Self-driving_car', children: [] },
            ]
          },
          {
            id: 'aviation', name: 'Aviation', slug: 'aviation', icon: '✈️',
            description: 'Design, development, production, and operation of aircraft.',
            parentId: 'transportation', level: 2, wikiTitle: 'Aviation',
            children: [
              { id: 'commercial-aviation', name: 'Commercial Aviation', slug: 'commercial-aviation', icon: '🛫', description: 'Air transport services available to the public.', parentId: 'aviation', level: 3, wikiTitle: 'Commercial_aviation', children: [] },
              { id: 'drones', name: 'Drones', slug: 'drones', icon: '🚁', description: 'Unmanned aerial vehicles for various applications.', parentId: 'aviation', level: 3, wikiTitle: 'Unmanned_aerial_vehicle', children: [] },
            ]
          },
          {
            id: 'maritime', name: 'Maritime', slug: 'maritime', icon: '🚢',
            description: 'Navigation and transport on seas and oceans.',
            parentId: 'transportation', level: 2, wikiTitle: 'Maritime_transport',
            children: [
              { id: 'shipping', name: 'Shipping', slug: 'shipping', icon: '📦', description: 'Transport of goods by sea.', parentId: 'maritime', level: 3, wikiTitle: 'Shipping', children: [] },
              { id: 'naval-architecture', name: 'Naval Architecture', slug: 'naval-architecture', icon: '⚓', description: 'Engineering discipline of design and construction of ships.', parentId: 'maritime', level: 3, wikiTitle: 'Naval_architecture', children: [] },
            ]
          },
          {
            id: 'rail-transport', name: 'Rail Transport', slug: 'rail-transport', icon: '🚄',
            description: 'Transport of passengers and goods on railways.',
            parentId: 'transportation', level: 2, wikiTitle: 'Rail_transport',
            children: [
              { id: 'high-speed-rail', name: 'High-Speed Rail', slug: 'high-speed-rail', icon: '🚅', description: 'Rail transport significantly faster than traditional rail.', parentId: 'rail-transport', level: 3, wikiTitle: 'High-speed_rail', children: [] },
              { id: 'urban-rail', name: 'Urban Rail Transit', slug: 'urban-rail-transit', icon: '🚇', description: 'Rail mass transit systems within urban areas.', parentId: 'rail-transport', level: 3, wikiTitle: 'Urban_rail_transit', children: [] },
            ]
          },
        ]
      },
      {
        id: 'energy-tech', name: 'Energy Technology', slug: 'energy-technology', icon: '⚡',
        description: 'Technologies for energy generation, storage, and distribution.',
        parentId: 'technology-applied', level: 1, wikiTitle: 'Energy_technology',
        children: [
          {
            id: 'renewable-energy', name: 'Renewable Energy', slug: 'renewable-energy', icon: '☀️',
            description: 'Energy from sources that are naturally replenished.',
            parentId: 'energy-tech', level: 2, wikiTitle: 'Renewable_energy',
            children: [
              { id: 'solar-energy', name: 'Solar Energy', slug: 'solar-energy', icon: '🌞', description: 'Energy from the sun converted to thermal or electrical energy.', parentId: 'renewable-energy', level: 3, wikiTitle: 'Solar_energy', children: [] },
              { id: 'wind-energy', name: 'Wind Energy', slug: 'wind-energy', icon: '💨', description: 'Use of airflow through wind turbines for power.', parentId: 'renewable-energy', level: 3, wikiTitle: 'Wind_power', children: [] },
              { id: 'hydropower', name: 'Hydropower', slug: 'hydropower', icon: '💧', description: 'Power derived from the energy of falling or running water.', parentId: 'renewable-energy', level: 3, wikiTitle: 'Hydropower', children: [] },
              { id: 'geothermal', name: 'Geothermal Energy', slug: 'geothermal-energy', icon: '🌋', description: 'Heat energy from within the Earth.', parentId: 'renewable-energy', level: 3, wikiTitle: 'Geothermal_energy', children: [] },
            ]
          },
          {
            id: 'nuclear-energy', name: 'Nuclear Energy', slug: 'nuclear-energy', icon: '☢️',
            description: 'Energy released during nuclear reactions.',
            parentId: 'energy-tech', level: 2, wikiTitle: 'Nuclear_power',
            children: [
              { id: 'nuclear-fission', name: 'Nuclear Fission', slug: 'nuclear-fission', icon: '⚛️', description: 'Splitting of atomic nuclei to release energy.', parentId: 'nuclear-energy', level: 3, wikiTitle: 'Nuclear_fission', children: [] },
              { id: 'nuclear-fusion', name: 'Nuclear Fusion', slug: 'nuclear-fusion', icon: '🌟', description: 'Combining of atomic nuclei to release energy.', parentId: 'nuclear-energy', level: 3, wikiTitle: 'Nuclear_fusion', children: [] },
            ]
          },
          {
            id: 'energy-storage', name: 'Energy Storage', slug: 'energy-storage', icon: '🔋',
            description: 'Capture of energy for later use.',
            parentId: 'energy-tech', level: 2, wikiTitle: 'Energy_storage',
            children: [
              { id: 'batteries', name: 'Batteries', slug: 'batteries', icon: '🪫', description: 'Electrochemical cells that convert stored chemical energy.', parentId: 'energy-storage', level: 3, wikiTitle: 'Battery_(electricity)', children: [] },
              { id: 'hydrogen-fuel', name: 'Hydrogen Fuel', slug: 'hydrogen-fuel', icon: '💧', description: 'Use of hydrogen as a fuel for energy production.', parentId: 'energy-storage', level: 3, wikiTitle: 'Hydrogen_fuel', children: [] },
            ]
          },
        ]
      },
    ]
  },
];

// Utility functions
export function getAllCategories(): Category[] {
  const result: Category[] = [];
  function flatten(cats: Category[]) {
    for (const cat of cats) {
      result.push(cat);
      if (cat.children.length > 0) {
        flatten(cat.children);
      }
    }
  }
  flatten(categories);
  return result;
}

export function findCategoryBySlug(slug: string): Category | null {
  const all = getAllCategories();
  return all.find(c => c.slug === slug) || null;
}

export function findCategoryById(id: string): Category | null {
  const all = getAllCategories();
  return all.find(c => c.id === id) || null;
}

export function getBreadcrumbs(category: Category): Category[] {
  const crumbs: Category[] = [category];
  let current = category;
  while (current.parentId) {
    const parent = findCategoryById(current.parentId);
    if (parent) {
      crumbs.unshift(parent);
      current = parent;
    } else {
      break;
    }
  }
  return crumbs;
}

export function getCategoryPath(category: Category): string[] {
  const crumbs = getBreadcrumbs(category);
  return crumbs.map(c => c.slug);
}

export function countAllChildren(category: Category): number {
  let count = category.children.length;
  for (const child of category.children) {
    count += countAllChildren(child);
  }
  return count;
}
