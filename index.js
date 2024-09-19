const express = require('express');
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000;

const app = express();

app.use(cors());
app.use(express.json());


const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jnh1bzn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "JWT forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}


async function run() {
  try {

    const serviceCollection = client.db("doctorsPortal").collection("services");
    const bookingCollection = client.db("doctorsPortal").collection("bookings");
    const usersCollection = client.db("doctorsPortal").collection("users");
    const doctorCollection = client.db("doctorsPortal").collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "admin forbidden" });
      }
      next();
    }



    app.get('/services', async (req, res) => {
        const date = req.query.date;
        const query = {};
        const options = await serviceCollection.find(query).toArray();
        const bookingsQuery = { appointmentDate: date };
        const alreadyBooked = await bookingCollection.find(bookingsQuery).toArray();
        options.forEach(option => {
            const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
            const bookedSlots = optionBooked.map(book => book.slot);
            const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
            option.slots = remainingSlots;
        })
        res.send(options);
     });


     app.get('/appointmentSpecialty', async (req, res) => {
        const query = {};
        const result = await serviceCollection.find(query).project({name: 1}).toArray();
        res.send(result);
     })

     app.get('/bookings', verifyJWT, async (req, res) => {
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
            return res.status(403).send({message: 'forbidden access'})
        }
        const query = {email: email};
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
     })



     app.post('/bookings', async (req, res) => {
        const bookings = req.body;
        const query = {
            appointmentDate: bookings.appointmentDate,
            treatment: bookings.treatment,
            email: bookings.email
        }

        const alreadyBooked = await bookingCollection.find(query).toArray();

        if (alreadyBooked.length) {
            const message = `You already have a booking on ${bookings.appointmentDate}`;
            return res.send({acknowledged: false, message})
        }


        const result = await bookingCollection.insertOne(bookings);
        res.send(result);
     });

     app.get('/bookings/:id', async (req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const booking = await bookingCollection.findOne(query);
        res.send(booking);
     })



      // JWT TOKEN
     app.get('/jwt', async(req, res) => {
        const email = req.query.email;
        const query = {email: email};
        const user = await usersCollection.findOne(query);
        if (user) {
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'});
            return res.send({accessToken: token});
        }
        res.status(403).send({accessToken: '' });

     })


     app.get('/users', async (req, res) => {
        const query = {};
        const users = await usersCollection.find(query).toArray();
        res.send(users);
     })

     app.get('/users/admin/:email', async (req, res) => {
        const email = req.params.email;
        const query = {email};
        const user = await usersCollection.findOne(query);
        res.send({isAdmin: user?.role === 'admin'})
     })


     app.post('/users', async (req, res) => {
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        res.send(result);
     })

     app.put('/users/admin/:id', verifyJWT, async (req, res) => {
        const decodedEmail = req.decoded.email;
        const query = {email: decodedEmail};
        const user = await usersCollection.findOne(query);
        if (user?.role !== 'admin') {
            return res.status(403).send({message: 'forbidden access'})
        }
        const id = req.params.id;
        const filter = {_id: new ObjectId(id)};
        const options = {upsert: true};
        const updateDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = await usersCollection.updateOne(filter, updateDoc, options);
        res.send(result);
     })

    //  app.get('/addPrice', async (req, res) => {
    //     const filter = {};
    //     const options = {upsert: true};
    //     const updateDoc = {
    //         $set: {
    //             price: 100
    //         }
    //     }
    //     const result = await serviceCollection.updateMany(filter, updateDoc, options);
    //     res.send(result);
    //  })

     app.delete('/users/:id', async (req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await usersCollection.deleteOne(query);
        res.send(result);
     })


     app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
        const query = {};
        const doctors = await doctorCollection.find(query).toArray();
        res.send(doctors);
     })

     app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
        const doctor = req.body;
        const result = await doctorCollection.insertOne(doctor);
        res.send(result);
     })

     app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await doctorCollection.deleteOne(query);
        res.send(result);
     })

     app.delete('/bookings/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
   })


  }
  finally {
      
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Server is up and running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
