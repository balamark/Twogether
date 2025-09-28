// Character Mapping Service - handles gender-aware character name assignment for roleplay scripts

class CharacterMappingService {
  constructor() {
    // Role assignments based on category and gender
    this.roleAssignments = {
      // Idol/Photographer roleplay - Default female for idol, male for photographer
      idol_photographer: {
        female: { userRole: 'idol', partnerRole: 'photographer' },
        male: { userRole: 'idol', partnerRole: 'photographer' }
      },

      // Teacher/Student roleplay - Default female for student, male for teacher
      teacher_student: {
        female: { userRole: 'student', partnerRole: 'teacher' },
        male: { userRole: 'student', partnerRole: 'teacher' }
      },

      // Foreign Student roleplay - Default female for student
      foreign_student: {
        female: { userRole: 'student', partnerRole: 'foreign_lover' },
        male: { userRole: 'student', partnerRole: 'foreign_lover' }
      }
    };

    // Default role assignments (when user gender is not specified)
    this.defaultRoleAssignments = {
      idol_photographer: { userRole: 'idol', partnerRole: 'photographer' },
      teacher_student: { userRole: 'student', partnerRole: 'teacher' },
      foreign_student: { userRole: 'student', partnerRole: 'foreign_lover' }
    };
  }

  /**
   * Process a roleplay script template and replace character names based on user gender and actual nicknames
   * @param {string} template - The original template text
   * @param {string} category - The roleplay category (idol_photographer, teacher_student, etc.)
   * @param {string} userGender - The user's gender ('male', 'female', or null)
   * @param {string} userNickname - The actual user's nickname
   * @param {string} partnerNickname - The actual partner's nickname
   * @returns {string} - The processed template with appropriate character names
   */
  processTemplate(template, category, userGender = null, userNickname = 'You', partnerNickname = 'Partner') {
    if (!template || !category) {
      return template;
    }

    // Get role assignments for this category and gender
    const roles = this.getRoleAssignments(category, userGender);

    // Create character mapping using actual nicknames
    const characters = {
      primary: userNickname,
      secondary: partnerNickname,
      userRole: roles.userRole,
      partnerRole: roles.partnerRole
    };

    // Replace character names in the template
    let processedTemplate = template;

    // Common replacements based on the patterns found in the migration
    processedTemplate = this.replaceCharacterNames(processedTemplate, characters);

    return processedTemplate;
  }

  /**
   * Get appropriate role assignments for a given category and user gender
   * @param {string} category - The roleplay category
   * @param {string} userGender - The user's gender
   * @returns {object} - Object with userRole and partnerRole
   */
  getRoleAssignments(category, userGender) {
    // Use default if category not found or gender not specified
    if (!this.roleAssignments[category] || !userGender) {
      return this.defaultRoleAssignments[category] || { userRole: 'user', partnerRole: 'partner' };
    }

    // Return the mapping for the user's gender, fallback to female if gender not mapped
    return this.roleAssignments[category][userGender] ||
           this.roleAssignments[category]['female'] ||
           this.defaultRoleAssignments[category];
  }

  /**
   * Replace character names in the template text using regex patterns for any character names
   * @param {string} template - The template text
   * @param {object} characters - Character names object with primary/secondary and roles
   * @returns {string} - Template with replaced character names
   */
  replaceCharacterNames(template, characters) {
    let result = template;

    // Find any character name patterns in Chinese format: Name（description）
    // Replace them with actual user nicknames while preserving the structure

    // Pattern 1: Character name followed by parenthetical description
    // e.g., "小湘（滿臉興奮）" becomes "UserNickname（滿臉興奮）"
    result = result.replace(/([^（\s]+)\s*（([^）]+)）/g, (match, name, description) => {
      // Assume the first character name found is the user, subsequent ones are partner
      // This is a simplified approach - in a more sophisticated system, we'd analyze context
      if (result.indexOf(match) === result.indexOf(name)) {
        return `${characters.primary}（${description}）`;
      } else {
        return `${characters.secondary}（${description}）`;
      }
    });

    // Pattern 2: Standalone character names at start of dialogue
    // More complex pattern matching for dialogue structure
    result = result.replace(/^([^：\s]+)：/gm, (match, name) => {
      // If this is the first occurrence, assume it's the user
      const userPattern = new RegExp(`^${characters.primary}：`, 'm');
      if (!userPattern.test(result)) {
        return `${characters.primary}：`;
      } else {
        return `${characters.secondary}：`;
      }
    });

    // Pattern 3: Generic character name replacements based on context
    // This is a fallback for any remaining hardcoded names
    const commonNames = ['小湘', '皇上', '小明', '小芳', '老師', '學生', '偶像', '攝影師'];
    let userNameUsed = false;

    commonNames.forEach(name => {
      if (result.includes(name)) {
        if (!userNameUsed) {
          result = result.replace(new RegExp(name, 'g'), characters.primary);
          userNameUsed = true;
        } else {
          result = result.replace(new RegExp(name, 'g'), characters.secondary);
        }
      }
    });

    return result;
  }

  /**
   * Get all available character mappings for debugging/admin purposes
   * @returns {object} - All character mappings
   */
  getAllMappings() {
    return {
      mappings: this.characterMappings,
      defaults: this.defaultAssignments
    };
  }

  /**
   * Add or update character mapping for a category
   * @param {string} category - The roleplay category
   * @param {string} gender - The gender
   * @param {object} characters - Character names object
   */
  updateMapping(category, gender, characters) {
    if (!this.characterMappings[category]) {
      this.characterMappings[category] = {};
    }
    this.characterMappings[category][gender] = characters;
  }
}

module.exports = new CharacterMappingService();