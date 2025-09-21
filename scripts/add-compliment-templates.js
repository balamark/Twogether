const db = require('../database/db');

const complimentTemplates = [
  { timeHint: '甜蜜時光', roleplaySetup: '你好溫柔，你是我的女神 💕' },
  { timeHint: '愛的告白', roleplaySetup: '你是我見過最美麗的人，每天和你在一起都是幸福 ✨' },
  { timeHint: '溫馨時刻', roleplaySetup: '你的笑容是我最愛的風景，能讓我的心瞬間溫暖 😊' },
  { timeHint: '深情表達', roleplaySetup: '謝謝你一直在我身邊，你是我生命中最珍貴的禮物 🎁' },
  { timeHint: '浪漫情話', roleplaySetup: '和你在一起的每一天，都比昨天更愛你一點 💖' },
  { timeHint: '貼心話語', roleplaySetup: '你總是這麼體貼，讓我覺得自己是世界上最幸運的人 🍀' },
  { timeHint: '愛意滿滿', roleplaySetup: '你的溫柔像春風，你的愛像暖陽，照亮了我的整個世界 🌞' },
  { timeHint: '真心話', roleplaySetup: '遇見你是我這輩子最美好的事，願意和你走過每個春夏秋冬 🌸' },
  { timeHint: '甜蜜宣言', roleplaySetup: '你不只是我的戀人，更是我的最佳朋友和靈魂伴侶 👫' },
  { timeHint: '愛的承諾', roleplaySetup: '無論什麼時候，你都是我心中最特別的那個人 💝' }
];

async function addComplimentTemplates() {
  try {
    console.log('🚀 Adding compliment templates...');

    // First check if intimacy_templates table exists, create if not
    await db.query(`
      CREATE TABLE IF NOT EXISTS intimacy_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(50) NOT NULL,
        time_hint VARCHAR(200) NOT NULL,
        roleplay_setup TEXT NOT NULL,
        suggestion_level VARCHAR(20) NOT NULL DEFAULT 'subtle',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_intimacy_templates_category ON intimacy_templates(category);
    `);

    console.log('✅ Intimacy templates table ready');

    // Check if compliment templates already exist
    const existingResult = await db.query(
      'SELECT COUNT(*) as count FROM intimacy_templates WHERE category = $1',
      ['compliment']
    );

    const existingCount = parseInt(existingResult.rows[0].count);
    if (existingCount > 0) {
      console.log(`ℹ️ Found ${existingCount} existing compliment templates, skipping insertion`);
      return;
    }

    // Insert compliment templates
    let insertedCount = 0;
    for (const template of complimentTemplates) {
      await db.query(`
        INSERT INTO intimacy_templates (category, time_hint, roleplay_setup, suggestion_level, is_active)
        VALUES ($1, $2, $3, $4, $5)
      `, ['compliment', template.timeHint, template.roleplaySetup, 'subtle', true]);
      insertedCount++;
    }

    console.log(`✅ Successfully added ${insertedCount} compliment templates to the database`);

  } catch (error) {
    console.error('❌ Error adding compliment templates:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  addComplimentTemplates()
    .then(() => {
      console.log('✅ Compliment templates addition completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to add compliment templates:', error);
      process.exit(1);
    });
}

module.exports = { addComplimentTemplates };