const express = require('express');
const router = express.Router();

const authRouter = require('./auth');
const productsRouter = require('./products');
const partnersRouter = require('./partners');
const ordersModule = require('./orders');
const salesRouter = require('./sales');
const invoicesRouter = require('./invoices');
const productionRouter = require('./production');
const stockRouter = require('./stock');

router.use('/', authRouter);
router.use('/', productsRouter);
router.use('/', partnersRouter);
router.use('/', ordersModule.router);
router.use('/', salesRouter);
router.use('/', invoicesRouter);
router.use('/', productionRouter);
router.use('/', stockRouter);

module.exports = router;
