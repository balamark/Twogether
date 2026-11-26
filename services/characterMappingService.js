class CharacterMappingService {
  constructor() {
    this.roleAssignments = {
      idol_photographer: {
        female: { userRole: 'idol', partnerRole: 'photographer' },
        male: { userRole: 'idol', partnerRole: 'photographer' }
      },

      teacher_student: {
        female: { userRole: 'student', partnerRole: 'teacher' },
        male: { userRole: 'student', partnerRole: 'teacher' }
      },

      foreign_student: {
        female: { userRole: 'student', partnerRole: 'foreign_lover' },
        male: { userRole: 'student', partnerRole: 'foreign_lover' }
      }
    };

    this.defaultRoleAssignments = {
      idol_photographer: { userRole: 'idol', partnerRole: 'photographer' },
      teacher_student: { userRole: 'student', partnerRole: 'teacher' },
      foreign_student: { userRole: 'student', partnerRole: 'foreign_lover' }
    };
  }

  processTemplate(template, category, userGender = null, userNickname = 'You', partnerNickname = 'Partner') {
    if (!template || !category) {
      return template;
    }

    const roles = this.getRoleAssignments(category, userGender);

    const characters = {
      primary: userNickname,
      secondary: partnerNickname,
      userRole: roles.userRole,
      partnerRole: roles.partnerRole
    };

    let processedTemplate = template;

    processedTemplate = this.replaceCharacterNames(processedTemplate, characters);

    return processedTemplate;
  }

  getRoleAssignments(category, userGender) {
    if (!this.roleAssignments[category] || !userGender) {
      return this.defaultRoleAssignments[category] || { userRole: 'user', partnerRole: 'partner' };
    }

    return this.roleAssignments[category][userGender] ||
           this.roleAssignments[category]['female'] ||
           this.defaultRoleAssignments[category];
  }

  replaceCharacterNames(template, characters) {
    let result = template;

    result = result.replace(/([^（\s]+)\s*（([^）]+)）/g, (match, name, description) => {
      if (result.indexOf(match) === result.indexOf(name)) {
        return `${characters.primary}（${description}）`;
      } else {
        return `${characters.secondary}（${description}）`;
      }
    });

    result = result.replace(/^([^：\s]+)：/gm, (match, name) => {
      const userPattern = new RegExp(`^${characters.primary}：`, 'm');
      if (!userPattern.test(result)) {
        return `${characters.primary}：`;
      } else {
        return `${characters.secondary}：`;
      }
    });

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

  getAllMappings() {
    return {
      mappings: this.characterMappings,
      defaults: this.defaultAssignments
    };
  }

  updateMapping(category, gender, characters) {
    if (!this.characterMappings[category]) {
      this.characterMappings[category] = {};
    }
    this.characterMappings[category][gender] = characters;
  }
}

module.exports = new CharacterMappingService();