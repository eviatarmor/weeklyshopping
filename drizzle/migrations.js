import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_recipe_content_hash.sql';
import m0002 from './0002_meal_plan.sql';
import m0003 from './0003_cooking_ingredients.sql';
import m0004 from './0004_timers.sql';
import m0005 from './0005_prices.sql';
import m0006 from './0006_notes_regulars_kitchen.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006
    }
  }
  