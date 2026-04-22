/* ============================================================
   FINIA — backend/routes/budget.js   (fixed)
   Fixes:
   1. Broken Cypher ORDER BY on aggregated query → fixed
   2. Description no longer required for expenses
   3. Better error messages so frontend knows what failed
   4. JWT_SECRET reads consistently from env
   ============================================================ */

const express = require('express');
const jwt     = require('jsonwebtoken');
const { runQuery, runWrite, serializeNode } = require('../db');

const router = express.Router();

/* JWT_SECRET must match exactly what auth.js uses */
const JWT_SECRET = process.env.JWT_SECRET || 'finia_super_secret_key_change_in_production';

/* ── Auth middleware ── */
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided.' });
  }
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch (err) {
    console.error('[Auth] Token verify failed:', err.message);
    return res.status(401).json({ message: 'Token invalid or expired. Please log in again.' });
  }
}
router.use(authenticate);

/* ════════════════════════════════
   GET /api/budget
   ════════════════════════════════ */
router.get('/', async (req, res) => {
  try {
    /* FIX: split into two queries — ORDER BY doesn't work after collect() in one shot */
    const budgetRecords = await runQuery(`
      MATCH (u:User {id: $userId})-[:HAS_BUDGET]->(b:Budget)
      RETURN b
      ORDER BY b.createdAt DESC
      LIMIT 1
    `, { userId: req.user.id });

    if (!budgetRecords.length) {
      return res.json({ budget: null });
    }

    const budgetProps = serializeNode(budgetRecords[0].get('b'));

    /* Fetch categories separately */
    const catRecords = await runQuery(`
      MATCH (b:Budget {id: $budgetId})-[:HAS_CATEGORY]->(c:Category)
      RETURN c
    `, { budgetId: budgetProps.id });

    const categories = {};
    catRecords.forEach(r => {
      const c = serializeNode(r.get('c'));
      if (c && c.name) {
        categories[c.name] = { pct: c.percentage || 0, amount: c.amount || 0 };
      }
    });

    return res.json({
      budget: {
        id:         budgetProps.id,
        monthly:    budgetProps.monthly,
        categories,
        createdAt:  budgetProps.createdAt,
      }
    });

  } catch (err) {
    console.error('GET /budget error:', err.message);
    return res.status(500).json({ message: 'Failed to fetch budget: ' + err.message });
  }
});

/* ════════════════════════════════
   POST /api/budget
   ════════════════════════════════ */
router.post('/', async (req, res) => {
  try {
    const { monthly, categories } = req.body;

    if (!monthly || isNaN(monthly) || parseFloat(monthly) <= 0) {
      return res.status(400).json({ message: 'Monthly budget must be a positive number.' });
    }
    if (!categories || typeof categories !== 'object') {
      return res.status(400).json({ message: 'Categories object is required.' });
    }

    const budgetId  = `budget_${req.user.id}_${Date.now()}`;
    const createdAt = new Date().toISOString();

    /* Delete any existing budget for this user, then create new one */
    await runWrite(`
      MATCH (u:User {id: $userId})
      OPTIONAL MATCH (u)-[:HAS_BUDGET]->(old:Budget)
      OPTIONAL MATCH (old)-[:HAS_CATEGORY]->(oc:Category)
      DETACH DELETE old, oc
      WITH u
      CREATE (b:Budget { id: $budgetId, monthly: $monthly, createdAt: $createdAt })
      CREATE (u)-[:HAS_BUDGET]->(b)
    `, { userId: req.user.id, budgetId, monthly: parseFloat(monthly), createdAt });

    /* Create each category node */
    for (const [name, val] of Object.entries(categories)) {
      const catId = `cat_${budgetId}_${name}`;
      await runWrite(`
        MATCH (b:Budget {id: $budgetId})
        CREATE (c:Category { id: $catId, name: $name, percentage: $pct, amount: $amount })
        CREATE (b)-[:HAS_CATEGORY]->(c)
      `, {
        budgetId,
        catId,
        name,
        pct:    parseFloat(val.pct)    || 0,
        amount: parseFloat(val.amount) || 0,
      });
    }

    return res.json({
      message: 'Budget saved!',
      budget:  { id: budgetId, monthly: parseFloat(monthly), categories, createdAt }
    });

  } catch (err) {
    console.error('POST /budget error:', err.message);
    return res.status(500).json({ message: 'Failed to save budget: ' + err.message });
  }
});

/* ════════════════════════════════
   GET /api/budget/expenses
   ════════════════════════════════ */
router.get('/expenses', async (req, res) => {
  try {
    const { category } = req.query;

    /* Aura requires neo4j.int() for SKIP/LIMIT — plain JS numbers cause 500 errors */
    const neo4j  = require('neo4j-driver');
    const limit  = neo4j.int(parseInt(req.query.limit)  || 500);
    const offset = neo4j.int(parseInt(req.query.offset) || 0);

    /* Use two separate queries to avoid the dynamic WHERE + SKIP/LIMIT conflict on Aura */
    let records;
    if (category) {
      records = await runQuery(
        `MATCH (u:User {id:$userId})-[:HAS_EXPENSE]->(e:Expense)
         WHERE e.category = $category
         RETURN e ORDER BY e.date DESC
         SKIP $offset LIMIT $limit`,
        { userId: req.user.id, category, offset, limit }
      );
    } else {
      records = await runQuery(
        `MATCH (u:User {id:$userId})-[:HAS_EXPENSE]->(e:Expense)
         RETURN e ORDER BY e.date DESC
         SKIP $offset LIMIT $limit`,
        { userId: req.user.id, offset, limit }
      );
    }

    const expenses = records.map(r => serializeNode(r.get('e')));
    return res.json({ expenses });

  } catch (err) {
    console.error('GET /expenses error:', err.message);
    return res.status(500).json({ message: 'Failed to fetch expenses: ' + err.message });
  }
});

/* ════════════════════════════════
   POST /api/budget/expenses
   ════════════════════════════════ */
router.post('/expenses', async (req, res) => {
  try {
    const { description, amount, category, date } = req.body;

    /* FIX: description is now OPTIONAL */
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    const validCategories = ['savings','snacks','entertainment','rent','bills','others'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ message: `Category must be one of: ${validCategories.join(', ')}` });
    }

    const expenseId = `exp_${req.user.id}_${Date.now()}`;
    const expDate   = date ? new Date(date).toISOString() : new Date().toISOString();
    const createdAt = new Date().toISOString();
    /* Use category name as fallback description */
    const desc = (description && description.trim()) ? description.trim() : category;

    await runWrite(`
      MATCH (u:User {id: $userId})
      CREATE (e:Expense {
        id:          $expenseId,
        description: $description,
        amount:      $amount,
        category:    $category,
        date:        $date,
        createdAt:   $createdAt
      })
      CREATE (u)-[:HAS_EXPENSE]->(e)
    `, {
      userId:      req.user.id,
      expenseId,
      description: desc,
      amount:      parseFloat(amount),
      category,
      date:        expDate,
      createdAt,
    });

    return res.status(201).json({
      message: 'Expense added!',
      expense: { id: expenseId, description: desc, amount: parseFloat(amount), category, date: expDate }
    });

  } catch (err) {
    console.error('POST /expenses error:', err.message);
    return res.status(500).json({ message: 'Failed to add expense: ' + err.message });
  }
});

/* ════════════════════════════════
   DELETE /api/budget/expenses/:id
   ════════════════════════════════ */
router.delete('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await runWrite(`
      MATCH (u:User {id: $userId})-[:HAS_EXPENSE]->(e:Expense {id: $id})
      DETACH DELETE e
    `, { userId: req.user.id, id });
    return res.json({ message: 'Expense deleted.' });
  } catch (err) {
    console.error('DELETE /expenses error:', err.message);
    return res.status(500).json({ message: 'Failed to delete expense: ' + err.message });
  }
});

module.exports = router;

/* ════════════════════════════════
   GROUPS — Save, Load, Add Expense
   ════════════════════════════════ */

/* GET /api/budget/groups — load all groups for user */
router.get('/groups', async (req, res) => {
  try {
    /* Fetch all groups */
    const groupRecs = await runQuery(`
      MATCH (u:User {id:$uid})-[:HAS_GROUP]->(g:Group)
      RETURN g ORDER BY g.createdAt ASC
    `, { uid: req.user.id });

    const groups = [];
    for (const rec of groupRecs) {
      const g = serializeNode(rec.get('g'));

      /* Members stored as JSON array string */
      g.members = JSON.parse(g.membersJson || '[]');
      delete g.membersJson;

      /* Fetch group expenses */
      const expRecs = await runQuery(`
        MATCH (g:Group {id:$gid})-[:HAS_GEXPENSE]->(e:GExpense)
        RETURN e ORDER BY e.date ASC
      `, { gid: g.id });

      g.expenses = expRecs.map(r => {
        const e = serializeNode(r.get('e'));
        e.shares = JSON.parse(e.sharesJson || '[]');
        delete e.sharesJson;
        return e;
      });

      groups.push(g);
    }

    return res.json({ groups });
  } catch (err) {
    console.error('GET /groups error:', err.message);
    return res.status(500).json({ message: 'Failed to load groups: ' + err.message });
  }
});

/* POST /api/budget/groups — create a new group */
router.post('/groups', async (req, res) => {
  try {
    const { name, type, members } = req.body;
    if (!name || !members || !members.length) {
      return res.status(400).json({ message: 'Group name and members are required.' });
    }

    const gid = 'grp_' + req.user.id + '_' + Date.now();
    await runWrite(`
      MATCH (u:User {id:$uid})
      CREATE (g:Group {
        id: $gid, name: $name, type: $type,
        membersJson: $membersJson, createdAt: $createdAt
      })
      CREATE (u)-[:HAS_GROUP]->(g)
    `, {
      uid: req.user.id,
      gid,
      name: name.trim(),
      type: type || 'other',
      membersJson: JSON.stringify(members),
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      group: { id: gid, name: name.trim(), type: type || 'other', members, expenses: [], createdAt: new Date().toISOString() }
    });
  } catch (err) {
    console.error('POST /groups error:', err.message);
    return res.status(500).json({ message: 'Failed to create group: ' + err.message });
  }
});

/* POST /api/budget/groups/:id/expenses — add expense to a group */
router.post('/groups/:id/expenses', async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, paidBy, category, method, shares, date } = req.body;

    if (!amount || !paidBy) {
      return res.status(400).json({ message: 'Amount and paidBy are required.' });
    }

    /* Verify group belongs to this user */
    const check = await runQuery(`
      MATCH (u:User {id:$uid})-[:HAS_GROUP]->(g:Group {id:$gid}) RETURN g LIMIT 1
    `, { uid: req.user.id, gid: id });
    if (!check.length) return res.status(404).json({ message: 'Group not found.' });

    const eid = 'gexp_' + Date.now();
    await runWrite(`
      MATCH (g:Group {id:$gid})
      CREATE (e:GExpense {
        id: $eid, description: $description,
        amount: $amount, paidBy: $paidBy,
        category: $category, method: $method,
        sharesJson: $sharesJson,
        date: $date, createdAt: $createdAt
      })
      CREATE (g)-[:HAS_GEXPENSE]->(e)
    `, {
      gid: id,
      eid,
      description: (description || category || 'expense').trim(),
      amount: parseFloat(amount),
      paidBy,
      category: category || 'other',
      method: method || 'equal',
      sharesJson: JSON.stringify(shares || []),
      date: date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const expense = { id: eid, description, amount: parseFloat(amount), paidBy, category, method, shares: shares||[], date: date||new Date().toISOString() };
    return res.status(201).json({ expense });
  } catch (err) {
    console.error('POST /groups/:id/expenses error:', err.message);
    return res.status(500).json({ message: 'Failed to add group expense: ' + err.message });
  }
});

/* DELETE /api/budget/groups/:id — delete a group and all its expenses */
router.delete('/groups/:id', async (req, res) => {
  try {
    await runWrite(`
      MATCH (u:User {id:$uid})-[:HAS_GROUP]->(g:Group {id:$gid})
      OPTIONAL MATCH (g)-[:HAS_GEXPENSE]->(e:GExpense)
      DETACH DELETE g, e
    `, { uid: req.user.id, gid: req.params.id });
    return res.json({ message: 'Group deleted.' });
  } catch (err) {
    console.error('DELETE /groups/:id error:', err.message);
    return res.status(500).json({ message: 'Failed to delete group: ' + err.message });
  }
});