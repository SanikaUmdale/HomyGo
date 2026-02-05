// app.js (cleaned)


const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
// const session = require("express-session");
// const MongoStore = require("connect-mongo");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;


const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const userRouter = require("./routes/user.js");
const multer = require("multer");

// DB connection
const dbUrl = process.env.ATLASDB_URL;


console.log("DB URL =", dbUrl); // TEMP DEBUG

if (!dbUrl) {
  throw new Error("❌ ATLASDB_URL is NOT available in production");
}

async function main() {
  await mongoose.connect(dbUrl);
}
main()
  .then(() => console.log("connected to db"))
  .catch((err) => console.log(err));

// --- Middlewares (one-time) ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

// Multer setup (single place)
const uploadDir = path.join(__dirname, "public/uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Helper: flatten nested listing[...] into top-level keys
function flattenListingBody(req, res, next) {
  // multer will have populated req.body for multipart requests
  if (req.body && req.body.listing && typeof req.body.listing === "object") {
    req.body = { ...req.body, ...req.body.listing };
    delete req.body.listing;
  }
  next();
}


const store=MongoStore.create({
  mongoUrl:dbUrl,
  crypto:{
    secret: process.env.SECRET,
  },
  touchAfter:24*3600,
});
// const store = MongoStore.create({
//   mongoUrl: dbUrl,
//   touchAfter: 24 * 3600,
// });
console.log("MongoStore =", MongoStore);
console.log("MongoStore.create =", MongoStore.create);

store.on("error",(err)=>{
  console.log("ERROR in MANGO SESSION STORE",err);
});

// Session + flash + passport
const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};



app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// make currUser and flash available in all templates
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user || null;
  next();
});

// --- Routers ---
// If your listing router expects multer/flatten to run here,
// you can pass them in or use them inside the router.
// For now we mount routers normally.
app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

// If you want a quick test route for the multipart handling (optional):
// app.post('/debug-listings', upload.single('image'), flattenListingBody, (req,res)=>{
//   console.log('req.file =', req.file);
//   console.log('req.body =', req.body);
//   res.send('ok');
// });

// 404 and error handlers
app.all(/.*/, (req, res, next) => {
  next(new ExpressError(404, "Page Not Found"));
});
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong..!!" } = err;
  res.status(statusCode).render("error.ejs", { message });
});

// Expose upload and flattenListingBody if you want to use them in routers
app.locals.upload = upload;
app.locals.flattenListingBody = flattenListingBody;

// Start server
app.listen(8080, () => {
  console.log("server is listening to port 8080");
});
