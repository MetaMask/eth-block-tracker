module.exports = {
  webpack: {
    // from https://github.com/babel/babel-loader
    module: {
      rules: [
        // the 'transform-runtime' plugin tells babel to require the runtime
        // instead of inlining it.
        {
          test: /\.js$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['env'],
              plugins: ['transform-runtime']
            }
          }
        }
      ]
    }
  }
}