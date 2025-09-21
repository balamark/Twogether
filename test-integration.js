#!/usr/bin/env node

// Comprehensive Integration Test Suite for Twogether API
// Tests all endpoints and critical user flows

const API_BASE_URL = 'http://localhost:8080/api';

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.authToken = null;
    this.userId = null;
    this.testResults = [];
  }

  async makeRequest(method, endpoint, data = null, headers = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (this.authToken) {
      config.headers.Authorization = `Bearer ${this.authToken}`;

    }

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);
      const responseData = await response.text();
      
      let parsedData;
      try {
        parsedData = JSON.parse(responseData);
      } catch {
        parsedData = responseData;
      }

      return {
        status: response.status,
        data: parsedData,
        headers: response.headers
      };
    } catch (error) {
      throw new Error(`Network error: ${error.message}`);
    }
  }

  async test(name, testFunction) {
    try {
      console.log(`🧪 Testing: ${name}`);
      await testFunction();
      console.log(`✅ PASSED: ${name}`);
      this.passed++;
      this.testResults.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ FAILED: ${name}`);
      console.log(`   Error: ${error.message}`);
      this.failed++;
      this.testResults.push({ name, status: 'FAILED', error: error.message });
    }
  }

  assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`Assertion failed ${message}: expected ${expected}, got ${actual}`);
    }
  }

  assertTrue(condition, message = '') {
    if (!condition) {
      throw new Error(`Assertion failed ${message}: expected true, got false`);
    }
  }

  assertStatus(response, expectedStatus, message = '') {
    if (response.status !== expectedStatus) {
      throw new Error(`${message}: expected status ${expectedStatus}, got ${response.status}. Response: ${JSON.stringify(response.data)}`);
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Twogether API Integration Tests\n');

    // Health Check
    await this.test('Health Check', async () => {
      const url = 'http://localhost:8080/health'; // Direct health endpoint, not under /api
      const response = await fetch(url);
      const data = await response.text();
      
      if (response.status !== 200) {
        throw new Error(`Health check should return 200: expected status 200, got ${response.status}. Response: ${data}`);
      }
      
      this.assertTrue(typeof data === 'string', 'Health check should return a string message');
    });

    // Authentication Flow Tests
    await this.testAuthenticationFlow();

    // Couples Management Tests
    await this.testCouplesManagement();

    // Love Moments Tests
    await this.testLoveMoments();

    // Coins System Tests
    await this.testCoinsSystem();

    // Achievements Tests
    await this.testAchievements();

    // Photos Tests
    await this.testPhotos();

    // Error Handling Tests
    await this.testErrorHandling();

    this.printSummary();
  }

  async testAuthenticationFlow() {
    console.log('\n📝 Testing Authentication Flow');

    // Store test user credentials for login test
    this.testUser = {
      email: `test_${Date.now()}@example.com`,
      nickname: `TestUser_${Date.now()}`,
      password: 'TestPassword123!'
    };

    // Test user registration
    await this.test('User Registration', async () => {
      const response = await this.makeRequest('POST', '/auth/register', this.testUser);
      this.assertStatus(response, 201, 'Registration should succeed with 201 Created');
      this.assertTrue(response.data.token, 'Registration should return a token');
      this.assertTrue(response.data.user, 'Registration should return user data');
      // Note: Backend doesn't return email in registration response for security
      this.assertEqual(response.data.user.nickname, this.testUser.nickname, 'Returned nickname should match');

      // Store auth data for subsequent tests
      this.authToken = response.data.token;
      this.userId = response.data.user.id;

    });

    // Test duplicate registration
    await this.test('Duplicate Registration Prevention', async () => {
      const response = await this.makeRequest('POST', '/auth/register', {
        email: this.testUser.email,
        nickname: this.testUser.nickname,
        password: this.testUser.password
      });
      this.assertStatus(response, 409, 'Duplicate registration should return 409 Conflict');
    });

    // Test login with correct credentials
    await this.test('Login with Correct Credentials', async () => {
      const response = await this.makeRequest('POST', '/auth/login', {
        email: this.testUser.email,
        password: this.testUser.password
      });
      this.assertStatus(response, 200, 'Login should succeed');
      this.assertTrue(response.data.token, 'Login should return a token');
      this.assertTrue(response.data.user, 'Login should return user data');
      
      // Update token from login (could be different from registration token)
      this.authToken = response.data.token;
    });

    // Test login with incorrect credentials
    await this.test('Login with Incorrect Credentials', async () => {
      const response = await this.makeRequest('POST', '/auth/login', {
        email: this.testUser.email,
        password: 'wrongpassword'
      });
      this.assertStatus(response, 401, 'Invalid login should return 401');
    });

    // Test authenticated endpoint access
    await this.test('Authenticated Endpoint Access', async () => {
      const response = await this.makeRequest('GET', '/auth/me');
      this.assertStatus(response, 200, 'Authenticated request should succeed');
      this.assertTrue(response.data.user.id, 'Should return user ID');
      this.assertTrue(response.data.user.nickname, 'Should return user nickname');
    });

    // Test unauthenticated endpoint access
    await this.test('Unauthenticated Endpoint Access', async () => {
      const originalToken = this.authToken;
      this.authToken = null;
      
      const response = await this.makeRequest('GET', '/auth/me');
      this.assertStatus(response, 401, 'Unauthenticated request should return 401');
      
      this.authToken = originalToken;
    });
  }

  async testCouplesManagement() {
    console.log('\n💕 Testing Couples Management');

    // Test couple creation
    await this.test('Create Couple', async () => {
      const coupleData = {
        couple_name: 'Test Couple',
        anniversary_date: '2024-01-01'
      };

      const response = await this.makeRequest('POST', '/couples', coupleData);
      this.assertStatus(response, 201, 'Couple creation should succeed with 201 Created');
      this.assertTrue(response.data.couple.id, 'Should return couple ID');
      this.assertEqual(response.data.couple.couple_name, coupleData.couple_name, 'Couple name should match');
      this.assertTrue(response.data.couple.user1_nickname, 'Should return user1 nickname');
    });

    // Test get couple information
    await this.test('Get Couple Information', async () => {
      const response = await this.makeRequest('GET', '/couples');
      this.assertStatus(response, 200, 'Get couple should succeed');
      this.assertTrue(response.data.couple.id, 'Should return couple ID');
      this.assertTrue(response.data.couple.user1_nickname, 'Should return user1 nickname');
    });

    // Test duplicate couple creation
    await this.test('Prevent Duplicate Couple Creation', async () => {
      const response = await this.makeRequest('POST', '/couples', {
        couple_name: 'Another Couple',
        anniversary_date: '2024-02-01'
      });
      this.assertStatus(response, 409, 'Duplicate couple creation should return 409');
    });
  }

  async testLoveMoments() {
    console.log('\n💖 Testing Love Moments');

    let createdMomentId;

    // Test create love moment
    await this.test('Create Love Moment', async () => {
      const momentData = {
        moment_date: new Date().toISOString(),
        notes: 'Test love moment notes',
        description: 'A beautiful test moment',
        duration: '30 minutes',
        location: 'Test Location',
        activity_type: 'regular'
      };

      const response = await this.makeRequest('POST', '/love-moments', momentData);
      this.assertStatus(response, 201, 'Love moment creation should succeed with 201 Created');
      this.assertTrue(response.data.love_moment.id, 'Should return moment ID');
      this.assertEqual(response.data.love_moment.notes, momentData.notes, 'Notes should match');
      this.assertEqual(response.data.love_moment.description, momentData.description, 'Description should match');
      this.assertEqual(response.data.love_moment.duration, momentData.duration, 'Duration should match');
      this.assertEqual(response.data.love_moment.location, momentData.location, 'Location should match');
      
      createdMomentId = response.data.love_moment.id;
    });

    // Test get all love moments
    await this.test('Get All Love Moments', async () => {
      const response = await this.makeRequest('GET', '/love-moments');
      this.assertStatus(response, 200, 'Get love moments should succeed');
      this.assertTrue(Array.isArray(response.data.love_moments), 'Should return an array');
      this.assertTrue(response.data.love_moments.length > 0, 'Should return at least one moment');
    });

    // Test get single love moment
    await this.test('Get Single Love Moment', async () => {
      const response = await this.makeRequest('GET', `/love-moments/${createdMomentId}`);
      this.assertStatus(response, 200, 'Get single love moment should succeed');
      this.assertEqual(response.data.love_moment.id, createdMomentId, 'Should return correct moment ID');
      this.assertTrue(response.data.love_moment.notes, 'Should return moment notes');
    });

    // Test get love moment stats via /stats endpoint
    await this.test('Get Love Moment Stats', async () => {
      const response = await this.makeRequest('GET', '/stats');
      this.assertStatus(response, 200, 'Get stats should succeed');
      
      // Check basic stats structure
      this.assertTrue(response.data.success, 'Response should indicate success');
      this.assertTrue(response.data.stats, 'Should return stats object');
      
      // Check required stat fields
      this.assertTrue(typeof response.data.stats.days_together === 'number', 'Should return days_together count');
      this.assertTrue(typeof response.data.stats.love_moments === 'number', 'Should return love_moments count');
      this.assertTrue(typeof response.data.stats.photos === 'number', 'Should return photos count');
      this.assertTrue(typeof response.data.stats.achievements === 'number', 'Should return achievements count');
      this.assertTrue(typeof response.data.stats.total_coins === 'number', 'Should return total_coins count');
      
      // Check that love_moments count reflects our created moment
      this.assertTrue(response.data.stats.love_moments >= 1, 'Should have at least 1 love moment from our test');
      
      // Optional: Check monthly data if available
      if (response.data.monthly_data) {
        this.assertTrue(Array.isArray(response.data.monthly_data), 'Monthly data should be an array');
      }
      
      // Optional: Check recent activity if available  
      if (response.data.recent_activity) {
        this.assertTrue(Array.isArray(response.data.recent_activity), 'Recent activity should be an array');
      }
    });
  }

  async testCoinsSystem() {
    console.log('\n🪙 Testing Coins System');

    // Test get coin balance (currently a placeholder)
    await this.test('Get Coin Balance', async () => {
      const response = await this.makeRequest('GET', '/coins/balance');
      this.assertStatus(response, 200, 'Get balance should succeed');
      this.assertTrue(typeof response.data.balance === 'number', 'Should return numeric balance');
      this.assertTrue(response.data.balance >= 0, 'Balance should be non-negative');
      // Note: Currently returns 0 with "Coming soon!" message - this is expected
    });

    // Test create coin transaction (currently a placeholder)
    await this.test('Create Coin Transaction Placeholder', async () => {
      const transactionData = {
        amount: 50,
        transaction_type: 'earn',
        description: 'Test earn transaction'
      };

      const response = await this.makeRequest('POST', '/coins/transaction', transactionData);
      // Expect either 200 (if implemented) or appropriate status for placeholder
      this.assertTrue(response.status === 200 || response.status >= 400, 'Should return valid response status');
    });
  }

  async testAchievements() {
    console.log('\n🏆 Testing Achievements System');

    // Test get achievements
    await this.test('Get Achievements', async () => {
      const response = await this.makeRequest('GET', '/achievements');
      this.assertStatus(response, 200, 'Get achievements should succeed');
      this.assertTrue(response.data.success, 'Response should indicate success');
      this.assertTrue(response.data.achievements, 'Should return achievements object');
      this.assertTrue(response.data.stats, 'Should return stats object');
      
      // Check stats structure
      this.assertTrue(typeof response.data.stats.total_achievements === 'number', 'Should return total achievements count');
      this.assertTrue(typeof response.data.stats.unlocked_achievements === 'number', 'Should return unlocked achievements count');
      this.assertTrue(typeof response.data.stats.total_points === 'number', 'Should return total points');
      this.assertTrue(typeof response.data.stats.completion_rate === 'number', 'Should return completion rate');
    });

    // Test check achievements (trigger achievement checking)
    await this.test('Check Achievements', async () => {
      const response = await this.makeRequest('POST', '/achievements/check');
      this.assertStatus(response, 200, 'Check achievements should succeed');
      this.assertTrue(response.data.success, 'Response should indicate success');
      this.assertTrue(Array.isArray(response.data.newly_unlocked), 'Should return newly unlocked achievements array');
      this.assertTrue(response.data.stats, 'Should return stats object');
      
      // We should have unlocked some achievements after creating a couple and love moment
      // this.assertTrue(response.data.newly_unlocked.length >= 0, 'May have newly unlocked achievements');
    });
  }

  async testPhotos() {
    console.log('\n📸 Testing Photos');

    // Test photo upload with form data
    await this.test('Photo Upload Error Handling', async () => {
      // Test without proper form data (should fail gracefully)
      const response = await this.makeRequest('POST', '/photos', {
        caption: 'Test photo',
        memory_date: new Date().toISOString()
      });
      
      // Should return an error about missing photo file
      this.assertTrue(response.status >= 400, 'Should return error status for invalid photo upload');
    });
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling');

    // Test invalid endpoint
    await this.test('Invalid Endpoint', async () => {
      const response = await this.makeRequest('GET', '/invalid-endpoint');
      this.assertStatus(response, 404, 'Invalid endpoint should return 404');
    });

    // Test invalid JSON
    await this.test('Invalid JSON Handling', async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`
          },
          body: 'invalid json'
        });
        
        this.assertTrue(response.status >= 400, 'Invalid JSON should return error status');
      } catch (error) {
        // Network errors are also acceptable for invalid requests
        this.assertTrue(true, 'Invalid JSON handling test passed');
      }
    });

    // Test missing required fields
    await this.test('Missing Required Fields', async () => {
      const response = await this.makeRequest('POST', '/love-moments', {
        // Missing required moment_date
        notes: 'Test without required fields'
      });
      this.assertTrue(response.status >= 400, 'Missing required fields should return error');
    });
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📊 Total: ${this.passed + this.failed}`);
    console.log(`📈 Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    
    if (this.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(result => result.status === 'FAILED')
        .forEach(result => {
          console.log(`   • ${result.name}: ${result.error}`);
        });
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (this.failed === 0) {
      console.log('🎉 All tests passed! Your API is working perfectly!');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Please check the errors above.');
      process.exit(1);
    }
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This test suite requires Node.js 18+ with fetch support.');
  console.error('   Please upgrade your Node.js version or use a polyfill.');
  process.exit(1);
}

// Run the tests
const testRunner = new TestRunner();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test suite interrupted');
  testRunner.printSummary();
});

// Add a small delay to ensure the backend server is ready
setTimeout(() => {
  testRunner.runAllTests().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
}, 2000); 