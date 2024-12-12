import User from "../models/user.model.js";
import Message from "../models/message.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

// Fonction pour le chiffrement de César
const caesarCipher = (text, shift) => {
  return text
    .split('')
    .map(char => {
      if (/[a-z]/.test(char)) {
        return String.fromCharCode(((char.charCodeAt(0) - 97 + shift) % 26) + 97);
      } else if (/[A-Z]/.test(char)) {
        return String.fromCharCode(((char.charCodeAt(0) - 65 + shift) % 26) + 65);
      }
      return char; // Les caractères non alphabétiques restent inchangés
    })
    .join('');
};

// Fonction pour le déchiffrement de César
const caesarDecipher = (text, shift) => {
  return text
    .split('')
    .map(char => {
      if (/[a-z]/.test(char)) {
        return String.fromCharCode(((char.charCodeAt(0) - 97 - shift + 26) % 26) + 97);
      } else if (/[A-Z]/.test(char)) {
        return String.fromCharCode(((char.charCodeAt(0) - 65 - shift + 26) % 26) + 65);
      }
      return char; // Les caractères non alphabétiques restent inchangés
    })
    .join('');
};

// Récupérer les utilisateurs pour la barre latérale
export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Récupérer les messages
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    // Décalage utilisé lors du chiffrement
    const shift = 3;

    // Déchiffrez les messages avant de les renvoyer
    const decryptedMessages = messages.map(message => ({
      ...message._doc,
      text: message.text ? caesarDecipher(message.text, shift) : null,
    }));

    res.status(200).json(decryptedMessages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Envoyer un message
export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // Chiffrement du message avec un décalage de 3
    const shift = 3;
    const encryptedText = text ? caesarCipher(text, shift) : null;

    let imageUrl;
    if (image) {
      // Upload base64 image to Cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text: encryptedText, // Stockage du texte chiffré
      image: imageUrl,
    });

    await newMessage.save();

    // Déchiffrez le texte pour l'envoi via WebSocket
    const decryptedMessage = {
      ...newMessage._doc,
      text: encryptedText ? caesarDecipher(encryptedText, shift) : null,
    };

    const receiverSocketId = getReceiverSocketId(receiverId);
    const senderSocketId = getReceiverSocketId(senderId); // Récupère le socket de l'expéditeur

    // Envoyer le message déchiffré au destinataire (si connecté)
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", decryptedMessage);
    }

    // Envoyer le message déchiffré à l'expéditeur (pour éviter le texte chiffré)
    if (senderSocketId) {
      io.to(senderSocketId).emit("newMessage", decryptedMessage);
    }

    // Réponse HTTP pour l'expéditeur
    res.status(201).json(decryptedMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
