import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_recipe_content_hash.sql';
import m0002 from './0002_meal_plan.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002
    }
  }
  